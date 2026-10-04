"use client";

import { Check, Copy, ExternalLink, FileText, Paperclip, RotateCw, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  addAttachment,
  decideTriage,
  deleteAttachment,
  deleteComment,
  getThread,
  replyToComment,
  retryTriage,
  updateComment,
  type Attachment,
  type TriageDecision,
} from "@/app/(app)/actions";
import type { DashboardComment, Member } from "@/lib/data";
import { ago, commentToMarkdown } from "@/lib/export";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { triageInsights, type Insight } from "@/lib/triage/insights";
import { EmojiInsert } from "./emoji-insert";
import { Pin } from "./pin";
import { Linkified, LoomEmbeds } from "./rich-text";
import { Badge, Button, cx, IconButton, Select, STATUS_LABEL, Textarea } from "./ui";

type Thread = Awaited<ReturnType<typeof getThread>>;

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

// Mirrors the storage bucket's allowed types and 10 MB limit, so people get a clear message up front.
const ATTACH_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" };
const MAX_ATTACH = 10 * 1024 * 1024;

const ACTIVITY: Record<string, (m: Record<string, unknown>) => string> = {
  "comment.created": () => "left the comment",
  "comment.status": (m) => `moved it from ${String(m.from).replace("_", " ")} to ${String(m.to).replace("_", " ")}`,
  "comment.priority": (m) => `changed priority from ${m.from} to ${m.to}`,
  "comment.assignee": (m) => (m.to ? "reassigned it" : "unassigned it"),
  "comment.repinned": () => "moved the pin to the right element",
  "triage.accepted": () => "applied the AI labels",
  "triage.dismissed": () => "dismissed the AI flag",
  "client.approved": () => "confirmed the fix",
  "client.rejected": () => "said it isn't right yet",
};

export function CommentDetail({
  comment: c,
  pageUrl,
  members,
  onPatch,
  onRemoved,
  onClose,
}: {
  comment: DashboardComment;
  pageUrl: string;
  members: Member[];
  onPatch: (id: string, partial: Partial<DashboardComment>) => void;
  onRemoved: (id: string) => void;
  onClose?: () => void;
}) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [pending, start] = useTransition();
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // A different comment starts empty; an update to the same one refreshes in place, without a "Loading…" flash.
  const [shown, setShown] = useState(c.id);
  if (shown !== c.id) {
    setShown(c.id);
    setThread(null);
  }
  useEffect(() => {
    let live = true;
    void getThread(c.id).then((t) => live && setThread(t));
    return () => {
      live = false;
    };
  }, [c.id, c.updated_at]);

  const change = (partial: Partial<DashboardComment>) => {
    const before: Partial<DashboardComment> = {};
    for (const k of Object.keys(partial) as (keyof DashboardComment)[]) (before as Record<string, unknown>)[k] = c[k];
    // Resolving a client's comment asks them to confirm (the database does it); show that at once.
    onPatch(c.id, partial.status === "resolved" && c.author_guest_id ? { ...partial, client_review: "pending" } : partial);
    setError(null);
    start(async () => {
      const r = await updateComment(c.id, partial as Parameters<typeof updateComment>[1]);
      if (!r.ok) {
        onPatch(c.id, before);
        setError(r.error);
      }
    });
  };

  const sendReply = () => {
    const text = reply.trim();
    if (!text) return;
    start(async () => {
      const r = await replyToComment(c.id, text);
      if (!r.ok) return setError(r.error);
      setReply("");
      setThread((t) => (t ? { ...t, replies: [...t.replies, r.data] } : t));
    });
  };

  const attach = async (files: File[]) => {
    const projectId = thread?.projectId;
    if (!projectId) return;
    setError(null);
    for (const file of files) {
      const ext = ATTACH_EXT[file.type];
      if (!ext) {
        setError("Attach images (PNG, JPG, WebP, GIF) or PDFs.");
        continue;
      }
      if (file.size > MAX_ATTACH) {
        setError(`${file.name} is over 10 MB.`);
        continue;
      }
      setUploading((n) => n + 1);
      const path = `${projectId}/${c.id}/${crypto.randomUUID()}.${ext}`;
      // Straight from the browser to private storage; row-level security checks project access.
      const { error: up } = await supabaseBrowser().storage.from("attachments").upload(path, file, { contentType: file.type });
      const r = up ? null : await addAttachment(c.id, path, file.name);
      setUploading((n) => n - 1);
      if (!r?.ok) {
        setError(r?.error ?? `Couldn't upload ${file.name}. Try again.`);
        continue;
      }
      setThread((t) => (t ? { ...t, attachments: [...t.attachments, r.data] } : t));
    }
  };

  const removeAttachment = (id: string) =>
    start(async () => {
      const r = await deleteAttachment(id);
      if (!r.ok) return setError(r.error);
      setThread((t) => (t ? { ...t, attachments: t.attachments.filter((a) => a.id !== id) } : t));
    });

  const changes = c.change_summary?.changes ?? [];
  const client = c.author_name.split(" ")[0] || "The client";
  const pinState = c.status === "resolved" ? "resolved" : c.anchor_state === "detached" || c.anchor_state === "suggested" ? "changed" : "open";

  return (
    <article className="flex min-h-0 flex-1 flex-col" aria-label={`Comment ${c.number}`}>
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <Pin number={c.number} state={pinState} className="mt-0" />
        <Select
          aria-label="Status"
          value={c.status}
          onChange={(e) => change({ status: e.target.value as DashboardComment["status"] })}
          className="h-8 w-auto"
        >
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        {c.status !== "resolved" && (
          <Button size="sm" variant="primary" onClick={() => change({ status: "resolved" })}>
            <Check aria-hidden />
            Resolve
          </Button>
        )}
        {onClose && (
          <IconButton aria-label="Close" onClick={onClose} className="ml-auto">
            <X />
          </IconButton>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
        <div>
          <h2 className="text-[17px] font-medium leading-snug tracking-[-0.015em]">{c.title ?? c.body.split("\n")[0]}</h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-muted">
            <span className="font-medium text-ink-2">{c.author_name}</span>
            {c.author_guest_id && <Badge tone="info">Client</Badge>}
            <span>· {ago(c.created_at)}</span>
            {c.category && <Badge>{c.category}</Badge>}
            {c.context.qa && <Badge tone="ink">Page check</Badge>}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Priority</span>
            <Select value={c.priority} onChange={(e) => change({ priority: e.target.value as DashboardComment["priority"] })}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p[0]!.toUpperCase() + p.slice(1)}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Assignee</span>
            <Select value={c.assignee_id ?? ""} onChange={(e) => change({ assignee_id: e.target.value || null })}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {c.anchor_state === "detached" && (
          <Notice title="Element removed">The element this comment was pinned to is no longer on the page. It may have been fixed by removing it, or the page was rebuilt.</Notice>
        )}
        {c.anchor_state === "suggested" && (
          <Notice title="Element changed">The commented element changed or moved. The pin on the site shows the closest match.</Notice>
        )}
        {c.status !== "resolved" && changes.length > 0 && (
          <Notice tone="info" title="Changed since this comment, likely addressed">
            <ul className="mt-1.5 space-y-0.5 font-mono text-[11px]">
              {changes.slice(0, 8).map((ch) => (
                <li key={ch.field}>
                  {ch.field}: <span className="line-through opacity-60">{ch.from}</span> → {ch.to}
                </li>
              ))}
            </ul>
            <Button size="sm" variant="primary" className="mt-3" onClick={() => change({ status: "resolved" })}>
              <Check aria-hidden />
              Verify and resolve
            </Button>
            {c.author_guest_id && <p className="mt-2 text-[12px] opacity-80">{client} will be asked to confirm it on the page.</p>}
          </Notice>
        )}
        {c.client_review === "pending" && (
          <Notice tone="info" title={`Waiting for ${client} to confirm`}>
            They were emailed a link that opens the page on this comment, with Looks good and Not yet.
          </Notice>
        )}
        {c.client_review === "approved" && (
          <p className="flex items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-2 text-[13px] ring-1 ring-inset ring-[#cfe9c6]">
            <Check aria-hidden className="size-4 text-[#1f5c12]" />
            {client} confirmed the fix.
          </p>
        )}
        {c.client_review === "rejected" && c.status !== "resolved" && (
          <Notice title={`Sent back by ${client}`}>They checked the fix and said it isn&apos;t right yet. Their note, if they left one, is in the replies.</Notice>
        )}

        <TriageCard
          comment={c}
          busy={pending}
          onDecide={(decision) =>
            start(async () => {
              const r = await decideTriage(c.id, decision);
              if (!r.ok) return setError(r.error);
              onPatch(c.id, r.data.patch);
              const sent = r.data.reply;
              if (sent) setThread((t) => (t ? { ...t, replies: [...t.replies, sent] } : t));
            })
          }
          onRetry={() =>
            start(async () => {
              onPatch(c.id, { triage_state: "pending" });
              const r = await retryTriage(c.id);
              if (!r.ok) {
                onPatch(c.id, { triage_state: "unavailable" });
                setError(r.error);
              }
            })
          }
        />

        <figure className="flex flex-col gap-2">
          <figcaption className="eyebrow">What they wrote</figcaption>
          <blockquote className="whitespace-pre-wrap rounded-lg border-l-[3px] border-pink bg-pink-soft/60 px-3 py-2.5 text-[14px] leading-relaxed">
            <Linkified text={c.body} />
          </blockquote>
          <LoomEmbeds text={c.body} />
        </figure>

        {thread?.screenshotUrl && (
          <a href={thread.screenshotUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg ring-1 ring-line transition-shadow hover:shadow-[var(--shadow-soft)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage */}
            <img src={thread.screenshotUrl} alt={`Screenshot attached to comment ${c.number}`} className="max-h-72 w-full bg-sunken object-contain" />
          </a>
        )}

        {thread && (thread.attachments.length > 0 || uploading > 0) && (
          <section aria-label="Files" className="flex flex-col gap-2">
            <h3 className="eyebrow">Files</h3>
            <ul className="grid grid-cols-3 gap-2">
              {thread.attachments.map((a) => (
                <AttachmentTile key={a.id} file={a} onRemove={a.mine ? () => removeAttachment(a.id) : undefined} />
              ))}
              {uploading > 0 && <li className="grid aspect-square place-items-center rounded-lg bg-sunken text-[12px] text-muted ring-1 ring-line">Uploading…</li>}
            </ul>
          </section>
        )}

        <dl className="grid grid-cols-[76px_1fr] gap-x-3 gap-y-2.5 text-[13px]">
          <dt className="eyebrow pt-0.5">Page</dt>
          <dd className="min-w-0 truncate">
            <a href={pageUrl} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:decoration-ink">
              {pageUrl.replace(/^https?:\/\//, "")}
            </a>
          </dd>
          {c.anchor && (
            <>
              <dt className="eyebrow pt-0.5">Element</dt>
              <dd className="min-w-0 break-all font-mono text-[11px] leading-relaxed text-ink-2">{c.anchor.selector}</dd>
              {c.anchor.classes.length > 0 && (
                <>
                  <dt className="eyebrow pt-0.5">Classes</dt>
                  <dd className="flex flex-wrap gap-1">
                    {c.anchor.classes.map((cl) => (
                      <code key={cl} className="rounded-md bg-sunken px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-inset ring-line">
                        .{cl}
                      </code>
                    ))}
                  </dd>
                </>
              )}
            </>
          )}
          {c.context.viewport && (
            <>
              <dt className="eyebrow pt-0.5">Viewport</dt>
              <dd className="tabular">
                {c.context.breakpoint} · {c.context.viewport.w}×{c.context.viewport.h}
                {c.context.dpr && c.context.dpr !== 1 ? ` @${c.context.dpr}x` : ""}
              </dd>
            </>
          )}
          {c.context.browser && (
            <>
              <dt className="eyebrow pt-0.5">Device</dt>
              <dd>
                {c.context.browser} · {c.context.os} · {c.context.device}
              </dd>
            </>
          )}
        </dl>

        <section aria-label="Replies" className="flex flex-col gap-3 border-t border-line pt-4">
          <h3 className="eyebrow">Replies</h3>
          {!thread ? (
            <p className="text-[13px] text-muted">Loading…</p>
          ) : thread.replies.length === 0 ? (
            <p className="text-[13px] text-muted">No replies yet.</p>
          ) : (
            thread.replies.map((r) => (
              <div key={r.id} className="text-[14px]">
                <p className="text-[12px]">
                  <span className="font-medium">{r.author_name}</span> <span className="text-muted">· {ago(r.created_at)}</span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">
                  <Linkified text={r.body} />
                </p>
                <div className="mt-2 flex flex-col gap-2 empty:hidden">
                  <LoomEmbeds text={r.body} />
                </div>
              </div>
            ))
          )}
          <Textarea
            ref={replyRef}
            aria-label="Reply"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply();
            }}
            onPaste={(e) => {
              // Pasted screenshots become attachments instead of being lost.
              const files = [...e.clipboardData.files];
              if (!files.length) return;
              e.preventDefault();
              void attach(files);
            }}
            placeholder="Write a reply… (Ctrl/⌘ + Enter to send)"
            className="min-h-16"
            maxLength={5000}
          />
          <div className="flex items-center gap-0.5">
            <EmojiInsert target={replyRef} value={reply} onChange={setReply} />
            <IconButton aria-label="Attach files" disabled={!thread?.projectId} onClick={() => fileRef.current?.click()}>
              <Paperclip />
            </IconButton>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              disabled={!thread?.projectId}
              accept={Object.keys(ATTACH_EXT).join(",")}
              aria-label="Files to attach"
              onChange={(e) => {
                void attach([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
            <Button className="ml-auto" size="sm" variant="dark" disabled={pending || !reply.trim()} onClick={sendReply}>
              Reply
            </Button>
          </div>
        </section>

        {thread && thread.activity.length > 0 && (
          <details className="text-[13px]">
            <summary className="eyebrow cursor-pointer select-none">History ({thread.activity.length})</summary>
            <ol className="mt-2 space-y-1.5 border-l border-line pl-3">
              {thread.activity.map((a) => (
                <li key={a.id}>
                  <span className="font-medium">{a.actor_name}</span> {ACTIVITY[a.action]?.((a.meta ?? {}) as Record<string, unknown>) ?? a.action}{" "}
                  <span className="text-muted">· {ago(a.created_at)}</span>
                </li>
              ))}
            </ol>
          </details>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2.5">
        <Button
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(commentToMarkdown(c, pageUrl));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          title="Markdown with selector, classes and context, ready for Claude Code or Cursor"
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy for AI agent"}
        </Button>
        <a className={cx("inline-flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-medium text-ink-2 hover:bg-sunken hover:text-ink [&_svg]:size-4")} href={`${pageUrl}${pageUrl.includes("?") ? "&" : "?"}bn_feedback=1`} target="_blank" rel="noreferrer">
          <ExternalLink aria-hidden />
          Open on site
        </a>
        <IconButton
          aria-label="Delete comment"
          className="ml-auto hover:bg-danger-soft hover:text-danger"
          onClick={() => {
            if (!confirm(`Delete comment #${c.number}? This can't be undone.`)) return;
            start(async () => {
              const r = await deleteComment(c.id);
              if (!r.ok) return setError(r.error);
              onRemoved(c.id);
            });
          }}
        >
          <Trash2 />
        </IconButton>
      </footer>
    </article>
  );
}

function AttachmentTile({ file, onRemove }: { file: Attachment; onRemove?: () => void }) {
  const size = file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`;
  return (
    <li className="group relative">
      <a
        href={file.url ?? undefined}
        target="_blank"
        rel="noreferrer"
        title={`${file.name} · ${size}`}
        className="block aspect-square overflow-hidden rounded-lg bg-sunken ring-1 ring-line transition-shadow hover:shadow-[var(--shadow-soft)]"
      >
        {file.mime.startsWith("image/") && file.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
          <img src={file.url} alt={file.name} className="size-full object-cover" />
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center">
            <FileText aria-hidden className="size-6 text-muted" />
            <span className="line-clamp-2 break-all text-[11px] leading-tight">{file.name}</span>
            <span className="text-[10px] text-muted">{size}</span>
          </span>
        )}
      </a>
      {onRemove && (
        <IconButton
          aria-label={`Remove ${file.name}`}
          onClick={onRemove}
          className="absolute right-1 top-1 size-6 bg-panel/90 opacity-0 shadow-sm group-hover:opacity-100 focus-visible:opacity-100 [&_svg]:size-3.5"
        >
          <X />
        </IconButton>
      )}
    </li>
  );
}

function Notice({ tone = "pink", title, children }: { tone?: "pink" | "info"; title: string; children: React.ReactNode }) {
  return (
    <div className={cx("rounded-lg px-3 py-2.5 text-[13px] ring-1 ring-inset", tone === "pink" ? "bg-pink-soft ring-[#ffd3e3]" : "bg-info-soft ring-[#d4dcff]")}>
      <p className={cx("font-medium", tone === "pink" ? "text-pink-deep" : "text-info")}>{title}</p>
      <div className="mt-0.5 leading-relaxed text-ink-2">{children}</div>
    </div>
  );
}

const INSIGHT: Record<Insight["kind"], (i: never, author: string) => { title: string; detail: string | null; action: string; decision: TriageDecision }> = {
  clarify: (i: Extract<Insight, { kind: "clarify" }>, author) => ({ title: "Too vague to act on", detail: `“${i.question}”`, action: `Ask ${author}`, decision: "ask" }),
  duplicate: (i: Extract<Insight, { kind: "duplicate" }>) => ({ title: `Same request as #${i.of}`, detail: "Closing this one keeps the work in a single thread.", action: "Close as duplicate", decision: "duplicate" }),
  priority: (i: Extract<Insight, { kind: "priority" }>) => ({ title: `Looks ${i.to}, not ${i.from}`, detail: i.reason, action: `Set to ${i.to}`, decision: "priority" }),
  scope: (i: Extract<Insight, { kind: "scope" }>) => ({ title: "New work, not a tweak", detail: i.reason ?? "This needs something that isn't on the page yet, so it may affect scope and timeline.", action: "Noted", decision: "noted" }),
};

/**
 * AI triage stays out of the way: a clear comment is labelled silently. It shows up only with
 * something a person has to decide (each with its one-click action), or an exact text change to paste.
 */
function TriageCard({
  comment: c,
  busy,
  onDecide,
  onRetry,
}: {
  comment: DashboardComment;
  busy: boolean;
  onDecide: (d: TriageDecision) => void;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const t = c.triage;
  if (c.triage_state === "pending")
    return (
      <p className="flex animate-pulse items-center gap-1.5 text-[12px] text-muted" aria-live="polite">
        <Sparkles aria-hidden className="size-3.5" />
        AI is reading the comment and the element…
      </p>
    );
  if (c.triage_state === "unavailable")
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-[12px] text-muted ring-1 ring-inset ring-line">
        <span className="flex items-center gap-1.5">
          <Sparkles aria-hidden className="size-3.5" />
          AI triage isn&apos;t available for this comment.
        </span>
        <button type="button" onClick={onRetry} disabled={busy} className="inline-flex items-center gap-1 font-medium text-ink-2 hover:text-ink [&_svg]:size-3.5">
          <RotateCw aria-hidden />
          Retry
        </button>
      </div>
    );
  if (!t || c.triage_state === "dismissed") return null;

  const insights = c.triage_state === "ready" ? triageInsights(t, c.priority) : [];
  const author = c.author_name.split(" ")[0] || "the author";
  if (insights.length === 0 && !t.change) return null;

  return (
    <div className="flex flex-col gap-3">
      {insights.length > 0 && (
        <section aria-label="AI triage" className="rounded-xl bg-night px-4 py-3.5 text-white shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 font-pixel text-[12px] text-accent">
              <Sparkles aria-hidden className="size-3.5" />
              Needs your call
            </p>
            <button type="button" disabled={busy} onClick={() => onDecide("dismiss")} className="text-[12px] text-white/55 hover:text-white">
              Dismiss
            </button>
          </div>
          <ul className="mt-2.5 flex flex-col gap-3">
            {insights.map((i) => {
              const v = INSIGHT[i.kind](i as never, author);
              return (
                <li key={i.kind} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium leading-snug">{v.title}</span>
                    {v.detail && <span className="mt-0.5 block text-[13px] leading-relaxed text-white/70">{v.detail}</span>}
                  </span>
                  <Button size="sm" variant="primary" disabled={busy} onClick={() => onDecide(v.decision)} className="shrink-0">
                    {v.action}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {t.change && (
        <section aria-label="Text change" className="rounded-lg bg-accent-soft px-3 py-2.5 ring-1 ring-inset ring-[#cfe9c6]">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow text-[#1f5c12]">Text to paste</p>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-2 hover:text-ink [&_svg]:size-3.5"
              onClick={async () => {
                await navigator.clipboard.writeText(t.change!.to);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-1 text-[14px] leading-relaxed">
            {t.change.from && <span className="text-muted line-through">{t.change.from}</span>}
            {t.change.from && " → "}
            <span className="font-medium">{t.change.to}</span>
          </p>
        </section>
      )}
    </div>
  );
}
