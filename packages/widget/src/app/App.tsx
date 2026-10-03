import { capture, DocIndex, pinPoint, takeSnapshot, type Anchor, type Snapshot } from "@bn/anchor";
import type { CommentContext, Priority, Status, WidgetComment, WidgetMe } from "@bn/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { MountOptions } from "../loader";
import { Api, ApiError } from "./api";
import { describe, pageContext } from "./env";
import { isTypingTarget, placeCard, usePicker, useViewportTick } from "./hooks";
import { IconCheck, IconClose, IconComment, IconExit, IconList } from "./icons";
import { captureScreenshot } from "./screenshot";
import { Session } from "./session";
import { ago } from "./time";
import { Tracker, type Placed } from "./tracker";

type Phase = { k: "loading" } | { k: "signin"; note?: string } | { k: "ready" } | { k: "failed"; message: string };
type Mode = "browse" | "comment";

interface Draft {
  el: Element;
  label: string;
  anchor: Anchor;
  snapshot: Snapshot;
  context: CommentContext;
  point: { x: number; y: number };
  shot: Promise<string | undefined>;
}

const pageKey = () => location.href.split("#")[0]!;

export function App({ opts, host, destroy }: { opts: MountOptions; host: Element; destroy: () => void }) {
  const session = useMemo(() => new Session(opts), [opts]);
  const [phase, setPhase] = useState<Phase>({ k: "loading" });
  const [me, setMe] = useState<WidgetMe | null>(null);
  const [mode, setMode] = useState<Mode>("browse");
  const [comments, setComments] = useState<WidgetComment[]>([]);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Member is choosing the element a changed/removed comment belongs to.
  const [repin, setRepin] = useState<WidgetComment | null>(null);
  const tracker = useMemo(() => new Tracker(setPlaced), []);
  const page = useRef(pageKey());

  const api = useMemo(
    () =>
      new Api(
        opts.appOrigin,
        () => session.token,
        () => {
          session.setToken(null);
          setPhase(opts.embedded ? { k: "failed", message: "The dashboard session expired. Reload the page." } : { k: "signin", note: "Your session expired." });
        },
      ),
    [opts, session],
  );

  const flash = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2600);
  }, []);

  const load = useCallback(async () => {
    const { comments } = await api.comments(page.current);
    setComments(comments);
    return comments;
  }, [api]);

  const start = useCallback(async () => {
    try {
      setMe(await api.me());
      setPhase({ k: "ready" });
      const loaded = await load();
      tracker.start();
      // Emailed links point at one comment (#bn_c=…); otherwise tell a client what is waiting for them.
      const linked = /[#&]bn_c=([0-9a-f-]{36})/.exec(location.hash)?.[1];
      const waiting = loaded.filter((c) => c.mine && c.client_review === "pending");
      if (linked) {
        history.replaceState(null, "", location.pathname + location.search);
        if (loaded.some((c) => c.id === linked)) setOpenId(linked);
      } else if (waiting.length === 1) setOpenId(waiting[0]!.id);
      else if (waiting.length > 1) {
        setPanel(true);
        flash(`${waiting.length} fixes are ready for you to check`);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setPhase({ k: "failed", message: e instanceof Error ? e.message : "Something went wrong." });
    }
  }, [api, load, tracker, flash]);

  // Boot: obtain a token, then load.
  useEffect(() => {
    const off = session.onHost((msg) => {
      if (msg.type === "bn:init" || msg.type === "bn:mode") setMode(msg.mode);
      if (msg.type === "bn:refresh") void load();
      if (msg.type === "bn:focus") setOpenId(msg.commentId);
    });
    void session.init().then((token) => {
      if (token) void start();
      else setPhase(opts.embedded ? { k: "failed", message: "Couldn't connect to the dashboard." } : { k: "signin" });
    });
    return () => {
      off();
      tracker.stop();
    };
  }, [session, start, load, tracker, opts.embedded]);

  useEffect(() => tracker.set(comments), [comments, tracker]);

  // Multi-page sites and SPAs: follow navigation without a reload.
  useEffect(() => {
    if (phase.k !== "ready") return;
    const iv = window.setInterval(() => {
      const now = pageKey();
      if (now === page.current) return;
      page.current = now;
      setDraft(null);
      setOpenId(null);
      session.toHost({ type: "bn:navigated", url: now, title: document.title });
      void load();
    }, 1000);
    return () => window.clearInterval(iv);
  }, [phase.k, load, session]);

  // Members' browsers double as monitors: report anchor health and what changed since each comment.
  useEffect(() => {
    if (!me?.canModerate || placed.length === 0) return;
    const t = window.setTimeout(() => {
      const reports = tracker.reports();
      if (reports.length === 0) return;
      api
        .report(reports)
        .then(() =>
          setComments((list) =>
            list.map((c) => {
              const r = reports.find((x) => x.id === c.id);
              return r ? { ...c, anchor_state: r.state, change_summary: { comparable: r.comparable, changes: r.changes } } : c;
            }),
          ),
        )
        .catch(() => {});
    }, 1500);
    return () => window.clearTimeout(t);
  }, [placed, me, api, tracker]);

  // Focus requests (from the dashboard or the list) scroll the element into view.
  useEffect(() => {
    if (!openId) return;
    const p = placed.find((x) => x.comment.id === openId);
    p?.element?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  const moveTo = useCallback(
    async (c: WidgetComment, el: Element, point: { x: number; y: number }) => {
      const anchor = capture(el, point, new DocIndex(document));
      await api.repin(c.id, anchor);
      setComments((list) => list.map((x) => (x.id === c.id ? { ...x, anchor, anchor_state: "attached" } : x)));
      setRepin(null);
      setOpenId(c.id);
      flash(`Comment #${c.number} moved`);
    },
    [api, flash],
  );

  const onPick = useCallback((el: Element, point: { x: number; y: number }) => {
    if (repin) {
      moveTo(repin, el, point).catch((e: unknown) => flash(e instanceof Error ? e.message : "Couldn't move the comment."));
      return;
    }
    const anchor = capture(el, point, new DocIndex(document));
    setOpenId(null);
    setPanel(false);
    setDraft({
      el,
      label: describe(el),
      anchor,
      snapshot: takeSnapshot(el),
      context: pageContext(el),
      point,
      shot: captureScreenshot(el, anchor.offset),
    });
  }, [repin, moveTo, flash]);

  const picking = phase.k === "ready" && !draft && (mode === "comment" || repin !== null);
  const hover = usePicker(picking, host, onPick);
  useViewportTick(phase.k === "ready");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase.k !== "ready" || isTypingTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "c" || e.key === "C") {
        setMode((m) => (m === "comment" ? "browse" : "comment"));
      } else if (e.key === "Escape") {
        if (repin) setRepin(null);
        else if (draft) setDraft(null);
        else if (openId) setOpenId(null);
        else if (panel) setPanel(false);
        else setMode("browse");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase.k, repin, draft, openId, panel]);

  const submit = async (body: string, priority: Priority) => {
    if (!draft) return;
    const screenshot = await draft.shot;
    const { comment } = await api.create({ body, priority, anchor: draft.anchor, snapshot: draft.snapshot, context: draft.context, screenshot });
    setComments((list) => [...list, comment]);
    setDraft(null);
    session.toHost({ type: "bn:created", commentId: comment.id });
    flash(`Comment #${comment.number} added`);
  };

  const setStatus = async (id: string, status: Status) => {
    await api.setStatus(id, status);
    setComments((list) => list.map((c) => (c.id === id ? { ...c, status } : c)));
  };

  const reply = async (id: string, body: string) => {
    const { reply } = await api.reply(id, body);
    setComments((list) => list.map((c) => (c.id === id ? { ...c, replies: [...c.replies, reply] } : c)));
  };

  const review = async (c: WidgetComment, approved: boolean, note?: string) => {
    await api.review(c.id, approved, note);
    setComments((list) =>
      list.map((x) =>
        x.id !== c.id
          ? x
          : {
              ...x,
              client_review: approved ? "approved" : "rejected",
              status: approved ? x.status : "open",
              replies: note ? [...x.replies, { id: crypto.randomUUID(), author_name: me?.name ?? x.author_name, body: note, created_at: new Date().toISOString() }] : x.replies,
            },
      ),
    );
    flash(approved ? "Thanks, confirmed" : "Sent back to the team");
  };

  const leave = () => {
    tracker.stop();
    session.deactivate();
    destroy();
  };

  if (phase.k === "loading") return null;
  if (phase.k === "failed") return <Failure message={phase.message} onClose={opts.embedded ? null : leave} />;
  if (phase.k === "signin")
    return (
      <SignIn
        note={phase.note}
        onSignIn={async () => {
          const token = await session.connect();
          if (token) void start();
        }}
        onClose={leave}
      />
    );

  const open = placed.find((p) => p.comment.id === openId) ?? null;
  const openCount = comments.filter((c) => c.status !== "resolved").length;

  return (
    <>
      {hover && <Highlight el={hover} />}
      {placed.map((p) => (
        <Pin key={p.comment.id} placed={p} active={p.comment.id === openId} onClick={() => setOpenId(p.comment.id === openId ? null : p.comment.id)} />
      ))}
      {draft && <Composer draft={draft} onCancel={() => setDraft(null)} onSubmit={submit} />}
      {open && !draft && (
        <Thread
          placed={open}
          me={me!}
          onClose={() => setOpenId(null)}
          onStatus={setStatus}
          onReply={reply}
          onReview={(approved, note) => review(open.comment, approved, note)}
          onConfirm={(el, point) => moveTo(open.comment, el, point)}
          onRepick={() => {
            setRepin(open.comment);
            setOpenId(null);
          }}
        />
      )}
      {panel && (
        <Panel
          placed={placed}
          onPick={(id) => {
            setOpenId(id);
            setPanel(false);
          }}
          onClose={() => setPanel(false)}
        />
      )}
      <div class="bar ui" role="toolbar" aria-label="Feedback">
        {!opts.embedded && (
          <span class="brand" aria-hidden="true">
            BASENINE<i>Feedback</i>
          </span>
        )}
        <button aria-pressed={mode === "comment"} onClick={() => setMode(mode === "comment" ? "browse" : "comment")} title="Click anything to comment (C)">
          <IconComment />
          {mode === "comment" ? "Commenting" : "Comment"}
        </button>
        <button aria-pressed={panel} onClick={() => setPanel(!panel)} title="Comments on this page">
          <IconList />
          <span class="count">{openCount}</span>
          <span>open</span>
        </button>
        {!opts.embedded && (
          <>
            <span class="sep" />
            <button onClick={leave} title={`Signed in as ${me?.name}. Leave feedback mode`} aria-label="Exit feedback mode">
              <IconExit />
            </button>
          </>
        )}
      </div>
      {repin ? (
        <div class="toast ui" role="status">
          <i aria-hidden="true" class="pink" />
          Click the element comment #{repin.number} is about
          <button onClick={() => setRepin(null)}>Cancel</button>
        </div>
      ) : toast && (
        <div class="toast ui" role="status">
          <i aria-hidden="true" />
          {toast}
        </div>
      )}
    </>
  );
}

function Highlight({ el }: { el: Element }) {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  const labelTop = r.top > 30 ? r.top - 28 : r.bottom + 6;
  const [tag, ...classes] = describe(el).split(".");
  return (
    <>
      <div class="hl" style={{ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` }} />
      <div class="hl-label" style={{ left: `${Math.max(4, r.left)}px`, top: `${labelTop}px` }}>
        <b>{tag}</b>
        {classes.length > 0 && <span>.{classes.join(".")}</span>}
      </div>
    </>
  );
}

function Pin({ placed, active, onClick }: { placed: Placed; active: boolean; onClick: () => void }) {
  const { comment, element, resolution } = placed;
  if (!element || !comment.anchor) return null;
  const { x, y } = pinPoint(element, comment.anchor.offset);
  const r = element.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  if (y < -40 || y > window.innerHeight + 40 || x < -40 || x > window.innerWidth + 40) return null;
  const review = comment.mine && comment.client_review === "pending";
  const cls = ["pin", "ui", review ? "review" : comment.status === "resolved" ? "resolved" : "", resolution?.status === "suggested" ? "suggested" : ""].join(" ");
  return (
    <button
      class={cls}
      style={{ left: `${x}px`, top: `${y}px` }}
      aria-expanded={active}
      aria-label={`Comment ${comment.number}${resolution?.status === "suggested" ? " (element changed)" : ""}`}
      onClick={onClick}
    >
      {resolution?.status === "suggested" ? "?" : comment.number}
    </button>
  );
}

const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

function Composer({ draft, onCancel, onSubmit }: { draft: Draft; onCancel: () => void; onSubmit: (body: string, p: Priority) => Promise<void> }) {
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => area.current?.focus(), []);
  const { x, y } = pinPoint(draft.el, draft.anchor.offset);

  const send = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(body.trim(), priority);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the comment.");
      setBusy(false);
    }
  };

  return (
    <>
      <div class="pin draft" style={{ left: `${x}px`, top: `${y}px` }} aria-hidden="true">
        +
      </div>
      <div class="card ui" style={placeCard(x, y, 340, 300)} role="dialog" aria-label="New comment">
        <header>
          <span class="grow">
            <span class="target" title={draft.anchor.selector}>
              {draft.label}
            </span>
          </span>
          <span class="device">
            {draft.context.breakpoint} · {draft.context.viewport.w}px
          </span>
          <button class="x" onClick={onCancel} aria-label="Cancel">
            <IconClose />
          </button>
        </header>
        <div class="body">
          <textarea
            ref={area}
            value={body}
            placeholder="What should change?"
            maxLength={5000}
            onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
              if (e.key === "Escape") onCancel();
            }}
          />
          <div class="chips" role="radiogroup" aria-label="Priority">
            {PRIORITIES.map((p) => (
              <button key={p} class={`chip p-${p}`} role="radio" aria-pressed={priority === p} aria-checked={priority === p} onClick={() => setPriority(p)}>
                {p}
              </button>
            ))}
          </div>
          {error && <div class="err">{error}</div>}
        </div>
        <footer>
          <span class="hint">Screenshot, element and device are attached for you</span>
          <span class="spacer" />
          <button class="btn primary" disabled={!body.trim() || busy} onClick={() => void send()}>
            {busy ? "Sending…" : "Send"}
          </button>
        </footer>
      </div>
    </>
  );
}

const STATUS_LABEL: Record<Status, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved" };

function Thread({
  placed,
  me,
  onClose,
  onStatus,
  onReply,
  onReview,
  onConfirm,
  onRepick,
}: {
  placed: Placed;
  me: WidgetMe;
  onClose: () => void;
  onStatus: (id: string, s: Status) => Promise<void>;
  onReply: (id: string, body: string) => Promise<void>;
  onReview: (approved: boolean, note?: string) => Promise<void>;
  onConfirm: (el: Element, point: { x: number; y: number }) => Promise<void>;
  onRepick: () => void;
}) {
  const { comment, element, resolution } = placed;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const point = element && comment.anchor ? pinPoint(element, comment.anchor.offset) : { x: window.innerWidth - 380, y: 80 };
  const changes = comment.change_summary?.changes ?? [];
  const toReview = comment.mine && comment.client_review === "pending" && !me.canModerate;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="card ui" style={placeCard(point.x, point.y)} role="dialog" aria-label={`Comment ${comment.number}`}>
      <header>
        <span class="num">#{comment.number}</span>
        <span class={`status ${comment.status}`}>{STATUS_LABEL[comment.status]}</span>
        <span class="grow meta">{comment.priority !== "medium" ? comment.priority : ""}</span>
        <button class="x" onClick={onClose} aria-label="Close">
          <IconClose />
        </button>
      </header>
      <div class="body">
        {element && resolution?.status === "suggested" && (
          <div class="notice">
            <b>Element changed</b>This changed or moved since the comment. The pin shows the closest match.
            {me.canModerate && (
              <div class="acts">
                <button class="btn sm" disabled={busy} onClick={() => void act(() => onConfirm(element, point))}>
                  <IconCheck />
                  Confirm match
                </button>
                <button class="btn sm" disabled={busy} onClick={onRepick}>
                  Pick element
                </button>
              </div>
            )}
          </div>
        )}
        {!element && (
          <div class="notice">
            <b>Element removed</b>What this comment was on is no longer on this page.
            {me.canModerate && (
              <div class="acts">
                <button class="btn sm" disabled={busy} onClick={onRepick}>
                  Pick the new element
                </button>
              </div>
            )}
          </div>
        )}
        {toReview && (
          <div class="notice info">
            <b>Ready for you to check</b>The team marked this as done. Does it look right?
            <div class="acts">
              <button class="btn sm primary" disabled={busy} onClick={() => void act(() => onReview(true))}>
                <IconCheck />
                Looks good
              </button>
              <button class="btn sm" disabled={busy} onClick={() => void act(async () => (await onReview(false, text.trim() || undefined), setText("")))}>
                Not yet
              </button>
            </div>
          </div>
        )}
        {comment.client_review === "pending" && me.canModerate && (
          <div class="notice info">
            <b>Waiting for the client</b>
            {comment.author_name} was asked to confirm this fix.
          </div>
        )}
        {comment.client_review === "approved" && (
          <div class="notice info">
            <b>Confirmed</b>
            {comment.mine ? "You" : comment.author_name} confirmed this fix.
          </div>
        )}
        {comment.status !== "resolved" && changes.length > 0 && (
          <div class="notice info">
            <b>Changed since this comment</b>
            <ul>
              {changes.slice(0, 6).map((c) => (
                <li key={c.field}>
                  {c.field}: {c.from} → {c.to}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div class="msg">
          <span class="who">{comment.author_name}</span>
          <span class="text">{comment.body}</span>
          <span class="meta">{ago(comment.created_at)}</span>
        </div>
        {comment.replies.map((r) => (
          <div class="msg" key={r.id}>
            <span class="who">{r.author_name}</span>
            <span class="text">{r.body}</span>
            <span class="meta">{ago(r.created_at)}</span>
          </div>
        ))}
        <textarea
          value={text}
          placeholder={toReview ? "Not right yet? Say what's still off, then press Not yet" : "Reply…"}
          maxLength={5000}
          style={{ minHeight: "56px" }}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) void act(async () => (await onReply(comment.id, text.trim()), setText("")));
          }}
        />
        {error && <div class="err">{error}</div>}
      </div>
      <footer>
        {me.canModerate &&
          (comment.status === "resolved" ? (
            <button class="btn" disabled={busy} onClick={() => void act(() => onStatus(comment.id, "open"))}>
              Reopen
            </button>
          ) : (
            <button class="btn" disabled={busy} onClick={() => void act(() => onStatus(comment.id, "resolved"))}>
              <IconCheck />
              Resolve
            </button>
          ))}
        <span class="spacer" />
        <button class="btn dark" disabled={busy || !text.trim()} onClick={() => void act(async () => (await onReply(comment.id, text.trim()), setText("")))}>
          Reply
        </button>
      </footer>
    </div>
  );
}

function Panel({ placed, onPick, onClose }: { placed: Placed[]; onPick: (id: string) => void; onClose: () => void }) {
  const [showResolved, setShowResolved] = useState(false);
  const rows = placed
    .filter((p) => showResolved || p.comment.status !== "resolved" || (p.comment.mine && p.comment.client_review === "pending"))
    .sort((a, b) => a.comment.number - b.comment.number);
  return (
    <div class="card panel ui" role="dialog" aria-label="Comments on this page">
      <header>
        <span class="grow eyebrow">Comments on this page</span>
        <button class="chip" aria-pressed={showResolved} onClick={() => setShowResolved(!showResolved)}>
          Show resolved
        </button>
        <button class="x" onClick={onClose} aria-label="Close">
          <IconClose />
        </button>
      </header>
      {rows.length === 0 ? (
        <div class="empty">No {showResolved ? "" : "open "}comments yet. Press C, then click anything on the page.</div>
      ) : (
        <ul class="list">
          {rows.map(({ comment, element, resolution }) => {
            const state = !element ? "detached" : comment.status === "resolved" ? "resolved" : "";
            return (
              <li key={comment.id}>
                <button onClick={() => onPick(comment.id)}>
                  <span class={`badge ${state}`}>{comment.number}</span>
                  <span class="line">
                    <div class="t">{comment.title ?? comment.body}</div>
                    <div class="meta">
                      {comment.author_name} · {ago(comment.created_at)}
                      {!element ? " · element removed" : resolution?.status === "suggested" ? " · element changed" : ""}
                      {comment.mine && comment.client_review === "pending" ? " · ready for you to check" : ""}
                    </div>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SignIn({ note, onSignIn, onClose }: { note?: string; onSignIn: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div class="card signin ui" role="dialog" aria-label="Sign in to leave feedback">
      <header>
        <span class="grow brandline">
          <strong>BASENINE</strong>
          <span>Feedback</span>
        </span>
        <button class="x" onClick={onClose} aria-label="Close">
          <IconClose />
        </button>
      </header>
      <div class="body">
        <div>{note ? `${note} ` : ""}Sign in to leave feedback directly on this page.</div>
      </div>
      <footer>
        <span class="spacer" />
        <button
          class="btn primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onSignIn().finally(() => setBusy(false));
          }}
        >
          {busy ? "Waiting…" : "Sign in"}
        </button>
      </footer>
    </div>
  );
}

function Failure({ message, onClose }: { message: string; onClose: (() => void) | null }) {
  return (
    <div class="card signin ui" role="alert">
      <header>
        <span class="grow brandline">
          <strong>BASENINE</strong>
          <span>Feedback</span>
        </span>
        {onClose && (
          <button class="x" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        )}
      </header>
      <div class="body">{message}</div>
    </div>
  );
}
