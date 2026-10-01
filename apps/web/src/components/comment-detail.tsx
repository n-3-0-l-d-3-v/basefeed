"use client";

import { Check, Copy, ExternalLink, RotateCw, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { applyTriage, deleteComment, getThread, replyToComment, retryTriage, updateComment } from "@/app/(app)/actions";
import type { DashboardComment, Member } from "@/lib/data";
import { ago, commentToMarkdown } from "@/lib/export";
import { Pin } from "./pin";
import { Badge, Button, cx, IconButton, PRIORITY_TONE, Select, STATUS_LABEL, Textarea } from "./ui";

type Thread = Awaited<ReturnType<typeof getThread>>;

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

const ACTIVITY: Record<string, (m: Record<string, unknown>) => string> = {
  "comment.created": () => "left the comment",
  "comment.status": (m) => `moved it from ${String(m.from).replace("_", " ")} to ${String(m.to).replace("_", " ")}`,
  "comment.priority": (m) => `changed priority from ${m.from} to ${m.to}`,
  "comment.assignee": (m) => (m.to ? "reassigned it" : "unassigned it"),
  "triage.accepted": () => "accepted the AI suggestion",
  "triage.dismissed": () => "dismissed the AI suggestion",
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
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    setThread(null);
    void getThread(c.id).then((t) => live && setThread(t));
    return () => {
      live = false;
    };
  }, [c.id, c.updated_at]);

  const change = (partial: Partial<DashboardComment>) => {
    const before: Partial<DashboardComment> = {};
    for (const k of Object.keys(partial) as (keyof DashboardComment)[]) (before as Record<string, unknown>)[k] = c[k];
    onPatch(c.id, partial);
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

  const changes = c.change_summary?.changes ?? [];
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
          </Notice>
        )}

        <TriageCard
          comment={c}
          busy={pending}
          onAccept={() =>
            start(async () => {
              const r = await applyTriage(c.id, true);
              if (!r.ok) return setError(r.error);
              onPatch(c.id, {
                triage_state: "accepted",
                title: c.triage?.title ?? c.title,
                category: c.triage?.category ?? c.category,
                priority: c.triage?.priority ?? c.priority,
              });
            })
          }
          onDismiss={() =>
            start(async () => {
              const r = await applyTriage(c.id, false);
              if (!r.ok) return setError(r.error);
              onPatch(c.id, { triage_state: "dismissed" });
            })
          }
          onAsk={(q) => setReply(q)}
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
          <blockquote className="whitespace-pre-wrap rounded-lg border-l-[3px] border-pink bg-pink-soft/60 px-3 py-2.5 text-[14px] leading-relaxed">{c.body}</blockquote>
        </figure>

        {thread?.screenshotUrl && (
          <a href={thread.screenshotUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg ring-1 ring-line transition-shadow hover:shadow-[var(--shadow-soft)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage */}
            <img src={thread.screenshotUrl} alt={`Screenshot attached to comment ${c.number}`} className="max-h-72 w-full bg-sunken object-contain" />
          </a>
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
                <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">{r.body}</p>
              </div>
            ))
          )}
          <Textarea
            aria-label="Reply"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply();
            }}
            placeholder="Write a reply… (Ctrl/⌘ + Enter to send)"
            className="min-h-16"
            maxLength={5000}
          />
          <div className="flex justify-end">
            <Button size="sm" variant="dark" disabled={pending || !reply.trim()} onClick={sendReply}>
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

function Notice({ tone = "pink", title, children }: { tone?: "pink" | "info"; title: string; children: React.ReactNode }) {
  return (
    <div className={cx("rounded-lg px-3 py-2.5 text-[13px] ring-1 ring-inset", tone === "pink" ? "bg-pink-soft ring-[#ffd3e3]" : "bg-info-soft ring-[#d4dcff]")}>
      <p className={cx("font-medium", tone === "pink" ? "text-pink-deep" : "text-info")}>{title}</p>
      <div className="mt-0.5 leading-relaxed text-ink-2">{children}</div>
    </div>
  );
}

function TriageCard({
  comment: c,
  busy,
  onAccept,
  onDismiss,
  onAsk,
  onRetry,
}: {
  comment: DashboardComment;
  busy: boolean;
  onAccept: () => void;
  onDismiss: () => void;
  onAsk: (q: string) => void;
  onRetry: () => void;
}) {
  const t = c.triage;
  if (c.triage_state === "pending")
    return (
      <div className="rounded-xl bg-night px-4 py-3.5 text-white" aria-live="polite">
        <p className="flex items-center gap-1.5 font-pixel text-[12px] text-accent">
          <Sparkles aria-hidden className="size-3.5" />
          AI triage
        </p>
        <p className="mt-1.5 animate-pulse text-[13px] text-white/70">Reading the comment, the element and the screenshot…</p>
      </div>
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

  const accepted = c.triage_state === "accepted";
  if (accepted)
    return (
      <section aria-label="Task" className="rounded-lg bg-accent-soft px-3 py-2.5 ring-1 ring-inset ring-[#cfe9c6]">
        <p className="eyebrow text-[#1f5c12]">Task</p>
        <p className="mt-1 text-[14px] leading-relaxed">{t.task}</p>
      </section>
    );

  return (
    <section aria-label="AI triage" className="rounded-xl bg-night px-4 py-4 text-white shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-pixel text-[12px] text-accent">
          <Sparkles aria-hidden className="size-3.5" />
          AI suggestion
        </p>
        <span className="tabular text-[11px] text-white/55" title={t.model}>
          {Math.round(t.confidence * 100)}% sure
        </span>
      </div>
      <p className="mt-2.5 text-[15px] font-medium leading-snug">{t.title}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        <Badge tone="neutral" className="bg-white/10 text-white ring-white/15">
          {t.category}
        </Badge>
        <Badge tone={PRIORITY_TONE[t.priority]} className={t.priority === "medium" || t.priority === "low" ? "bg-white/10 text-white ring-white/15" : undefined}>
          {t.priority}
        </Badge>
        {t.duplicateOf && <Badge tone="pink">Same as #{t.duplicateOf}</Badge>}
      </div>
      <p className="mt-2.5 text-[13px] leading-relaxed text-white/80">{t.task}</p>
      {t.needsClarification && t.clarificationQuestion && (
        <div className="mt-3 rounded-lg bg-white/[0.07] px-3 py-2 text-[13px] ring-1 ring-inset ring-white/10">
          <span className="text-pink">Unclear. Ask:</span> {t.clarificationQuestion}{" "}
          <button type="button" className="font-medium text-white underline decoration-pink underline-offset-2" onClick={() => onAsk(t.clarificationQuestion!)}>
            Use as reply
          </button>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <Button size="sm" variant="primary" disabled={busy} onClick={onAccept}>
          <Check aria-hidden />
          Accept
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onDismiss} className="text-white/70 hover:bg-white/10 hover:text-white">
          Dismiss
        </Button>
      </div>
    </section>
  );
}
