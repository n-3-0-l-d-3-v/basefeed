"use client";

import { Ago } from "@/components/ago";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Check, Copy, Download, GripVertical, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { CommentDetail } from "@/components/comment-detail";
import { Pin } from "@/components/pin";
import { Badge, Button, cx, PRIORITY_TONE, Select, STATUS_LABEL } from "@/components/ui";
import { needsAttention, useLiveComments } from "@/components/use-live-comments";
import type { DashboardComment, Member } from "@/lib/data";
import { commentsToMarkdown } from "@/lib/export";
import { pathOf } from "@/lib/urls";
import { updateComment, updateComments } from "../../../actions";

type Status = DashboardComment["status"];
const COLUMNS: Status[] = ["open", "in_progress", "resolved"];
const RANK = { urgent: 0, high: 1, medium: 2, low: 3 } as const;
const COLUMN_DOT: Record<Status, string> = { open: "bg-pink", in_progress: "bg-info", resolved: "bg-accent" };

export function Board({
  projectId,
  pages,
  initialComments,
  members,
}: {
  projectId: string;
  pages: { id: string; url: string; title: string }[];
  initialComments: DashboardComment[];
  members: Member[];
}) {
  const { comments, patch, remove } = useLiveComments(projectId, initialComments);
  const [q, setQ] = useState("");
  const [pageId, setPageId] = useState("");
  const [assignee, setAssignee] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const urlOf = (c: DashboardComment) => pages.find((p) => p.id === c.page_id)?.url ?? "";

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return comments.filter(
      (c) =>
        (!pageId || c.page_id === pageId) &&
        (!assignee || (assignee === "none" ? !c.assignee_id : c.assignee_id === assignee)) &&
        (!attentionOnly || needsAttention(c)) &&
        (!needle || `${c.title ?? ""} ${c.body} ${c.author_name} #${c.number}`.toLowerCase().includes(needle)),
    );
  }, [comments, q, pageId, assignee, attentionOnly]);

  const byColumn = useMemo(() => {
    const m: Record<Status, DashboardComment[]> = { open: [], in_progress: [], resolved: [] };
    for (const c of filtered) m[c.status].push(c);
    for (const s of COLUMNS) m[s].sort((a, b) => RANK[a.priority] - RANK[b.priority] || b.number - a.number);
    return m;
  }, [filtered]);

  const move = async (id: string, status: Status) => {
    const c = comments.find((x) => x.id === id);
    if (!c || c.status === status) return;
    patch(id, { status });
    const r = await updateComment(id, { status });
    if (!r.ok) {
      patch(id, { status: c.status });
      setError(r.error);
    }
  };

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  /** One change for every selected card: shown at once, undone if the server refuses. */
  const bulk = async (change: { status?: Status; assignee_id?: string | null }) => {
    const ids = [...picked];
    const before = new Map(comments.filter((c) => picked.has(c.id)).map((c) => [c.id, { status: c.status, assignee_id: c.assignee_id }]));
    setBulkBusy(true);
    setError(null);
    for (const id of ids) patch(id, change);
    const r = await updateComments(projectId, ids, change);
    setBulkBusy(false);
    if (!r.ok) {
      for (const [id, was] of before) patch(id, was);
      return setError(r.error);
    }
    setPicked(new Set());
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (e.over) void move(String(e.active.id), e.over.id as Status);
  };

  const open = comments.find((c) => c.id === openId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-panel px-3 py-2 ring-1 ring-line">
        <label className="relative">
          <span className="sr-only">Search comments</span>
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search comments"
            className="h-9 w-56 rounded-lg border border-line-strong bg-panel pl-8 pr-3 text-[13px] placeholder:text-muted/70 focus:border-ink focus:outline-none focus:ring-4 focus:ring-accent/40"
          />
        </label>
        <Select aria-label="Page" value={pageId} onChange={(e) => setPageId(e.target.value)} className="w-44">
          <option value="">All pages</option>
          {pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title || pathOf(p.url)}
            </option>
          ))}
        </Select>
        <Select aria-label="Assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="w-40">
          <option value="">Anyone</option>
          <option value="none">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-ink-2 hover:bg-sunken">
          <input type="checkbox" checked={attentionOnly} onChange={(e) => setAttentionOnly(e.target.checked)} className="size-4 accent-[#b8245f]" />
          Needs a look
        </label>
        <a
          href={`/p/${projectId}/export`}
          download
          title="Every comment in this project as a spreadsheet file"
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-medium text-ink-2 hover:bg-sunken hover:text-ink [&_svg]:size-4"
        >
          <Download aria-hidden />
          Export CSV
        </a>
        <Button
          size="sm"
          onClick={async () => {
            const list = filtered.filter((c) => c.status !== "resolved");
            await navigator.clipboard.writeText(commentsToMarkdown(list, urlOf));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          title="Every open comment in this view as markdown for Claude Code or Cursor"
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy open for AI agent"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}
      {picked.size > 0 && (
        <div role="toolbar" aria-label="Selected comments" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-night px-3 py-2 text-[13px] text-white">
          <span className="font-medium">{picked.size} selected</span>
          <Select aria-label="Move selected to" className="w-40" disabled={bulkBusy} value="" onChange={(e) => e.target.value && void bulk({ status: e.target.value as Status })}>
            <option value="">Move to…</option>
            {COLUMNS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select aria-label="Assign selected to" className="w-44" disabled={bulkBusy} value="" onChange={(e) => e.target.value && void bulk({ assignee_id: e.target.value === "none" ? null : e.target.value })}>
            <option value="">Assign to…</option>
            <option value="none">Nobody</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
          <button type="button" className="ml-auto text-[12px] text-white/65 hover:text-white" onClick={() => setPicked(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      <DndContext id="board" sensors={sensors} onDragEnd={onDragEnd} accessibility={{ screenReaderInstructions: { draggable: "Press space to pick up a card, arrow keys to move it, space to drop it in a column." } }}>
        <div className="mt-3 grid min-h-0 flex-1 gap-3 overflow-x-auto md:grid-cols-3">
          {COLUMNS.map((s) => (
            <Column key={s} status={s} count={byColumn[s].length}>
              {byColumn[s].map((c) => (
                <Card key={c.id} c={c} pagePath={pathOf(urlOf(c))} assignee={members.find((m) => m.id === c.assignee_id)?.name} onOpen={() => setOpenId(c.id)} onMove={move} picked={picked.has(c.id)} onPick={() => toggle(c.id)} />
              ))}
            </Column>
          ))}
        </div>
      </DndContext>

      {open && (
        <div className="fixed inset-0 z-40 flex justify-end bg-ink/25 backdrop-blur-[2px]" onClick={() => setOpenId(null)}>
          <div className="m-2 flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-panel shadow-[var(--shadow-pop)]" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <CommentDetail
              key={open.id}
              comment={open}
              pageUrl={urlOf(open)}
              members={members}
              onPatch={patch}
              onRemoved={(id) => {
                remove(id);
                setOpenId(null);
              }}
              onClose={() => setOpenId(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Column({ status, count, children }: { status: Status; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${STATUS_LABEL[status]} column`}
      className={cx("flex min-h-48 min-w-64 flex-col rounded-xl bg-sunken/70 ring-1 ring-inset transition-colors", isOver ? "ring-ink" : "ring-line")}
    >
      <header className="flex items-center gap-2 px-3.5 pb-2 pt-3">
        <span aria-hidden className={cx("size-2 rounded-full", COLUMN_DOT[status])} />
        <h2 className="text-[13px] font-medium">{STATUS_LABEL[status]}</h2>
        <span className="tabular ml-auto text-[12px] text-muted">{count}</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 pt-0">
        {count === 0 ? <p className="py-10 text-center text-[12px] text-muted">Drop a card here</p> : children}
      </div>
    </section>
  );
}

function Card({
  c,
  pagePath,
  assignee,
  onOpen,
  onMove,
  picked,
  onPick,
}: {
  c: DashboardComment;
  pagePath: string;
  assignee?: string;
  onOpen: () => void;
  onMove: (id: string, s: Status) => void;
  picked: boolean;
  onPick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id });
  const pinState = c.status === "resolved" ? "resolved" : c.anchor_state === "detached" || c.anchor_state === "suggested" ? "changed" : "open";
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cx("group rounded-xl bg-panel p-3 ring-1 transition-shadow hover:shadow-[var(--shadow-soft)]", picked ? "ring-2 ring-ink" : "ring-line", isDragging && "z-10 rotate-[1deg] shadow-[var(--shadow-pop)]")}
    >
      <div className="flex items-start gap-2.5">
        <Pin number={c.number} state={pinState} />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <span className="block truncate font-mono text-[10px] text-muted">{pagePath}</span>
          <span className="mt-0.5 line-clamp-3 block text-[14px] leading-snug">{c.title ?? c.body}</span>
        </button>
        <input
          type="checkbox"
          checked={picked}
          onChange={onPick}
          aria-label={`Select comment ${c.number}`}
          className={cx("mt-1 size-4 accent-[#0a0a0a] transition-opacity focus-visible:opacity-100 group-hover:opacity-100", picked ? "opacity-100" : "opacity-0")}
        />
        <button
          type="button"
          {...listeners}
          {...attributes}
          aria-label={`Move comment ${c.number}`}
          className="-mr-1 cursor-grab touch-none rounded-md p-1 text-muted opacity-60 hover:bg-sunken hover:opacity-100 active:cursor-grabbing group-hover:opacity-100 [&_svg]:size-4"
        >
          <GripVertical />
        </button>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
        {c.priority !== "medium" && <Badge tone={PRIORITY_TONE[c.priority]}>{c.priority}</Badge>}
        {c.category && <Badge>{c.category}</Badge>}
        {c.triage_state === "ready" && <Badge tone="ink">Needs your call</Badge>}
            {c.context.qa && <Badge title="Found by the automated page check">Page check</Badge>}
            {c.client_review === "pending" && <Badge tone="info">Awaiting client</Badge>}
            {c.client_review === "approved" && <Badge tone="accent">Client confirmed</Badge>}
            {c.client_review === "rejected" && c.status !== "resolved" && <Badge tone="pink">Sent back</Badge>}
        {needsAttention(c) && <Badge tone="pink">Needs a look</Badge>}
        <span className="ml-auto truncate">
          {assignee ?? c.author_name} · <Ago iso={c.created_at} />
        </span>
      </div>
      <label className="sr-only" htmlFor={`mv-${c.id}`}>
        Status of comment {c.number}
      </label>
      <select id={`mv-${c.id}`} className="sr-only focus:not-sr-only focus:mt-2 focus:w-full" value={c.status} onChange={(e) => onMove(c.id, e.target.value as Status)}>
        {COLUMNS.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </article>
  );
}
