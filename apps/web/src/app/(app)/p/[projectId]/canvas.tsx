"use client";

import type { HostToWidget, WidgetToHost } from "@bn/shared";
import { ExternalLink, FileText, Frame, Laptop, MessageSquarePlus, Monitor, MousePointer2, Plus, RotateCw, Smartphone, Tablet } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CommentDetail } from "@/components/comment-detail";
import { Dialog } from "@/components/dialog";
import { InstallSnippet } from "@/components/install-snippet";
import { Pin } from "@/components/pin";
import { Badge, Button, cx, EmptyState, Field, IconButton, Input, Kbd, PRIORITY_TONE, Segmented } from "@/components/ui";
import { needsAttention, useLiveComments } from "@/components/use-live-comments";
import type { DashboardComment, Member } from "@/lib/data";
import { ago } from "@/lib/export";
import { embedUrl, normalizePageUrl, originOf, pathOf } from "@/lib/urls";
import { addPage, getComment, mintEmbedToken, removePage } from "../../actions";

type Project = { id: string; name: string; public_key: string; figma_url: string | null; allowed_origins: string[] };
type Page = { id: string; url: string; title: string; kind: string };

const DEVICES = [
  { id: "desktop", label: "Desktop", w: 1440, icon: Monitor },
  { id: "laptop", label: "Laptop", w: 1280, icon: Laptop },
  { id: "tablet", label: "Tablet", w: 768, icon: Tablet },
  { id: "mobile", label: "Mobile", w: 390, icon: Smartphone },
] as const;
type DeviceId = (typeof DEVICES)[number]["id"];

type Filter = "open" | "attention" | "all";
type FrameState = "loading" | "connected" | "missing";

const WIDGET_TIMEOUT_MS = 8000;

export function Canvas({
  project,
  pages,
  initialComments,
  members,
  appUrl,
}: {
  project: Project;
  pages: Page[];
  initialComments: DashboardComment[];
  members: Member[];
  appUrl: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { comments, patch, remove, upsert } = useLiveComments(project.id, initialComments);

  const livePages = pages.filter((p) => p.kind === "live");
  const pageId = search.get("page") ?? livePages[0]?.id ?? null;
  const page = livePages.find((p) => p.id === pageId) ?? livePages[0] ?? null;

  const [device, setDevice] = useState<DeviceId>("desktop");
  const [mode, setMode] = useState<"comment" | "browse">("comment");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [filter, setFilter] = useState<Filter>("open");
  const [selectedId, setSelectedId] = useState<string | null>(search.get("c"));
  const [frame, setFrame] = useState<FrameState>("loading");
  const [addOpen, setAddOpen] = useState(false);
  const [unlisted, setUnlisted] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const iframe = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });

  const origin = page ? originOf(page.url) : null;
  const width = DEVICES.find((d) => d.id === device)!.w;
  const scale = stageSize.w ? Math.min(1, (stageSize.w - 48) / width) : 1;

  const selectPage = useCallback(
    (id: string) => {
      const q = new URLSearchParams(search);
      q.set("page", id);
      q.delete("c");
      router.replace(`${pathname}?${q}`, { scroll: false });
      setSelectedId(null);
    },
    [router, pathname, search],
  );

  const post = useCallback(
    (msg: HostToWidget) => {
      if (origin && frame === "connected") iframe.current?.contentWindow?.postMessage(msg, origin);
    },
    [origin, frame],
  );

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStageSize({ w: e!.contentRect.width, h: e!.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Handshake with the widget inside the frame. Both sides check origins; the token is scoped to this site.
  useEffect(() => {
    if (!page || !origin) return;
    setFrame("loading");
    // Mint the session while the site loads, so answering the widget is instant.
    const token = mintEmbedToken(project.id, page.url);
    const timer = window.setTimeout(() => setFrame((f) => (f === "loading" ? "missing" : f)), WIDGET_TIMEOUT_MS);
    const onMessage = async (e: MessageEvent) => {
      if (e.source !== iframe.current?.contentWindow || e.origin !== origin) return;
      const msg = e.data as WidgetToHost;
      if (!msg || typeof msg.type !== "string") return;
      if (msg.type === "bn:ready") {
        // The widget is installed; from here on it's only a matter of handing it a session.
        window.clearTimeout(timer);
        const r = await token;
        if (!r.ok) return setFrame("missing");
        iframe.current?.contentWindow?.postMessage({ type: "bn:init", token: r.data.token, mode: modeRef.current } satisfies HostToWidget, origin);
        setFrame("connected");
      } else if (msg.type === "bn:created" || msg.type === "bn:selected") {
        if (!msg.commentId) return;
        // Don't wait for the realtime stream: fetch the new comment so it opens immediately.
        if (msg.type === "bn:created") {
          const row = await getComment(msg.commentId);
          if (row) upsert(row);
        }
        setSelectedId(msg.commentId);
      } else if (msg.type === "bn:navigated") {
        const url = normalizePageUrl(msg.url);
        const match = livePages.find((p) => p.url === url);
        if (match && match.id !== page.id) selectPage(match.id);
        setUnlisted(match ? null : url);
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
    };
    // Re-handshake only when the framed page itself changes; mode changes go through bn:mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id, origin, project.id, reload]);

  useEffect(() => post({ type: "bn:mode", mode }), [mode, post]);
  useEffect(() => {
    if (selectedId) post({ type: "bn:focus", commentId: selectedId });
  }, [selectedId, post]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "c") setMode((m) => (m === "comment" ? "browse" : "comment"));
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pageComments = useMemo(() => comments.filter((c) => c.page_id === page?.id), [comments, page?.id]);
  const counts = {
    open: pageComments.filter((c) => c.status !== "resolved").length,
    attention: pageComments.filter(needsAttention).length,
    all: pageComments.length,
  };
  const visible = pageComments.filter((c) => (filter === "all" ? true : filter === "open" ? c.status !== "resolved" : needsAttention(c)));
  const selected = comments.find((c) => c.id === selectedId) ?? null;
  const openByPage = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of comments) if (c.status !== "resolved") m.set(c.page_id, (m.get(c.page_id) ?? 0) + 1);
    return m;
  }, [comments]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 lg:flex-row" style={{ height: "calc(100vh - 128px)" }}>
      {/* Pages */}
      <aside className="flex w-full shrink-0 flex-col rounded-xl bg-panel ring-1 ring-line lg:w-56">
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <h2 className="eyebrow">Pages</h2>
          <IconButton aria-label="Add page" onClick={() => setAddOpen(true)} className="-mr-2">
            <Plus />
          </IconButton>
        </div>
        <ul className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-y-auto">
          {livePages.map((p) => {
            const n = openByPage.get(p.id) ?? 0;
            const current = p.id === page?.id;
            return (
              <li key={p.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => selectPage(p.id)}
                  aria-current={current ? "page" : undefined}
                  className={cx(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                    current ? "bg-sunken ring-1 ring-inset ring-line" : "hover:bg-sunken",
                  )}
                >
                  <FileText aria-hidden className={cx("size-4 shrink-0", current ? "text-ink" : "text-muted")} />
                  <span className="min-w-0 flex-1">
                    <span className={cx("block truncate text-[13px]", current ? "font-medium text-ink" : "text-ink-2")}>{p.title || pathOf(p.url)}</span>
                    <span className="block truncate font-mono text-[10px] text-muted">{pathOf(p.url)}</span>
                  </span>
                  {n > 0 && <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-pink px-1.5 text-[11px] font-bold text-plum">{n}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {project.figma_url && (
          <a
            href={project.figma_url}
            target="_blank"
            rel="noreferrer"
            className="mx-2 mb-2 mt-auto hidden items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:bg-sunken lg:flex"
          >
            <Frame aria-hidden className="size-4 text-muted" />
            Figma design
            <ExternalLink aria-hidden className="ml-auto size-3.5 text-muted" />
          </a>
        )}
      </aside>

      {/* Live site */}
      <section className="flex min-h-[460px] min-w-0 flex-1 flex-col overflow-hidden rounded-xl ring-1 ring-line">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2">
          <Segmented
            label="Device width"
            size="sm"
            value={device}
            onChange={setDevice}
            options={DEVICES.map((d) => ({
              value: d.id,
              title: `${d.label} · ${d.w}px`,
              label: (
                <>
                  <d.icon aria-hidden />
                  <span className="hidden xl:inline">{d.label}</span>
                  <span className="sr-only xl:hidden">{d.label}</span>
                </>
              ),
            }))}
          />
          <span className="tabular font-mono text-[11px] text-muted">
            {width}px · {Math.round(scale * 100)}%
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Segmented
              label="Mode"
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: "comment", label: (<><MessageSquarePlus aria-hidden />Comment</>), title: "Click anything to comment (C)" },
                { value: "browse", label: (<><MousePointer2 aria-hidden />Browse</>), title: "Use the site normally (C)" },
              ]}
            />
            <span className="hidden items-center gap-1 text-[11px] text-muted 2xl:flex">
              <Kbd>C</Kbd> to switch
            </span>
            {page && (
              <a
                href={`${page.url}?bn_feedback=1`}
                target="_blank"
                rel="noreferrer"
                aria-label="Open in a new tab with feedback on"
                title="Open in a new tab with feedback on"
                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink [&_svg]:size-4"
              >
                <ExternalLink />
              </a>
            )}
          </div>
        </div>

        {unlisted && (
          <div className="flex items-center gap-3 border-b border-line bg-info-soft px-4 py-2 text-[13px]">
            <span className="min-w-0 flex-1 truncate">
              You&apos;re on <span className="font-mono text-[12px]">{pathOf(unlisted)}</span>, which isn&apos;t in this project yet.
            </span>
            <Button
              size="sm"
              onClick={async () => {
                const r = await addPage(project.id, unlisted, "");
                if (r.ok) {
                  setUnlisted(null);
                  router.refresh();
                }
              }}
            >
              <Plus aria-hidden />
              Add page
            </Button>
          </div>
        )}

        <div ref={stage} className="dot-grid relative min-h-0 flex-1 overflow-hidden">
          {!page ? (
            <EmptyState title="No pages yet" action={<Button variant="primary" onClick={() => setAddOpen(true)}><Plus aria-hidden />Add page</Button>}>
              Add the first page of the site to start reviewing it.
            </EmptyState>
          ) : (
            <div className="absolute inset-x-0 top-5 flex justify-center">
              <div
                // shrink-0: the frame must render at the true device width and only be scaled visually,
                // otherwise "Desktop 1440" silently shows the site's tablet layout.
                className="origin-top shrink-0 overflow-hidden rounded-xl bg-panel shadow-[var(--shadow-pop)]"
                style={{ width, height: (stageSize.h - 40) / scale, transform: `scale(${scale})` }}
              >
                <iframe
                  key={`${page.id}:${reload}`}
                  ref={iframe}
                  src={embedUrl(page.url)}
                  title={`Live preview of ${page.title || page.url}`}
                  className="h-full w-full border-0"
                  // The client site keeps its own origin; it never shares the dashboard's.
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            </div>
          )}
          {page && frame !== "connected" && (
            <FrameStatus state={frame} appUrl={appUrl} publicKey={project.public_key} pageUrl={page.url} onRetry={() => setReload((n) => n + 1)} />
          )}
        </div>
      </section>

      {/* Comments */}
      <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl bg-panel ring-1 ring-line lg:w-[380px]">
        {selected ? (
          <CommentDetail
            key={selected.id}
            comment={selected}
            pageUrl={livePages.find((p) => p.id === selected.page_id)?.url ?? page?.url ?? ""}
            members={members}
            onPatch={patch}
            onRemoved={(id) => {
              remove(id);
              setSelectedId(null);
            }}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <>
            <div className="flex items-center gap-1 border-b border-line px-3 py-2.5" role="tablist" aria-label="Filter comments">
              {(
                [
                  ["open", "Open"],
                  ["attention", "Needs a look"],
                  ["all", "All"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={filter === id}
                  onClick={() => setFilter(id)}
                  className={cx(
                    "inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
                    filter === id ? "bg-night text-white" : "text-muted hover:bg-sunken hover:text-ink",
                  )}
                >
                  {label}
                  <span className={cx("tabular text-[11px]", filter === id ? "text-white/60" : "text-muted")}>{counts[id]}</span>
                </button>
              ))}
            </div>
            {visible.length === 0 ? (
              <EmptyState title={filter === "attention" ? "Nothing needs a look" : "No comments here yet"}>
                {mode === "comment" ? "Click anything on the page to leave the first comment." : "Switch to Comment, then click anything on the page."}
              </EmptyState>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto">
                {visible.map((c) => (
                  <CommentRow key={c.id} c={c} onSelect={() => setSelectedId(c.id)} />
                ))}
              </ul>
            )}
          </>
        )}
      </aside>

      <AddPageDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        projectId={project.id}
        onAdded={(id) => {
          setAddOpen(false);
          router.refresh();
          selectPage(id);
        }}
        onRemove={
          page
            ? async () => {
                if (!confirm(`Remove "${page.title || pathOf(page.url)}" and all its comments?`)) return;
                const r = await removePage(project.id, page.id);
                if (r.ok) {
                  setAddOpen(false);
                  router.replace(pathname);
                  router.refresh();
                }
              }
            : undefined
        }
      />
    </div>
  );
}

function CommentRow({ c, onSelect }: { c: DashboardComment; onSelect: () => void }) {
  const attention = needsAttention(c);
  return (
    <li className="border-b border-line last:border-b-0">
      <button type="button" onClick={onSelect} className="flex w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-sunken">
        <Pin number={c.number} state={c.status === "resolved" ? "resolved" : c.anchor_state === "detached" || c.anchor_state === "suggested" ? "changed" : "open"} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[14px] leading-snug text-ink">{c.title ?? c.body}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
            <span className="text-ink-2">{c.author_name}</span>
            {c.author_guest_id && <Badge tone="info">Client</Badge>}
            <span>· {ago(c.created_at)}</span>
            {c.priority !== "medium" && <Badge tone={PRIORITY_TONE[c.priority]}>{c.priority}</Badge>}
            {c.triage_state === "ready" && <Badge tone="ink">AI suggestion</Badge>}
            {attention && <Badge tone="pink">Needs a look</Badge>}
          </span>
        </span>
      </button>
    </li>
  );
}

function FrameStatus({ state, appUrl, publicKey, pageUrl, onRetry }: { state: FrameState; appUrl: string; publicKey: string; pageUrl: string; onRetry: () => void }) {
  if (state === "loading")
    return (
      <div className="pointer-events-none absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-night px-3.5 py-2 text-[12px] text-white shadow-[var(--shadow-soft)]">
        <span className="size-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
        Connecting to the page…
      </div>
    );
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-bg/85 p-4 backdrop-blur-[3px]">
      <div className="w-full max-w-lg rounded-2xl bg-panel p-6 shadow-[var(--shadow-pop)]" role="alert">
        <p className="eyebrow text-pink-deep">Setup needed</p>
        <h2 className="mt-2 text-[20px] font-normal tracking-[-0.02em]">The feedback script isn&apos;t on this page yet</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          Comments are pinned by a small script running on the site itself, so it works behind Cloudflare and on staging. Add it once and publish:
        </p>
        <div className="mt-4">
          <InstallSnippet appUrl={appUrl} publicKey={publicKey} />
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-muted">
          Already added? Publish the site and retry. If the site refuses to be shown inside other pages, use{" "}
          <a className="text-ink underline decoration-pink decoration-2 underline-offset-2" href={`${pageUrl}?bn_feedback=1`} target="_blank" rel="noreferrer">
            feedback mode in a new tab
          </a>
          . It works the same way.
        </p>
        <div className="mt-5 flex justify-end">
          <Button onClick={onRetry}>
            <RotateCw aria-hidden />
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}

function AddPageDialog({
  open,
  onClose,
  projectId,
  onAdded,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onAdded: (id: string) => void;
  onRemove?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onClose={onClose} title="Add a page" description="Any page on a connected site.">
      <form
        className="flex flex-col gap-4"
        action={(form) =>
          start(async () => {
            const r = await addPage(projectId, String(form.get("url") ?? ""), String(form.get("title") ?? ""));
            if (!r.ok) return setError(r.error);
            setError(null);
            onAdded(r.data.id);
          })
        }
      >
        <Field label="Page URL" htmlFor="ap-url" hint="A new domain is connected to the project automatically.">
          <Input id="ap-url" name="url" type="url" required placeholder="https://acme.webflow.io/pricing" autoFocus />
        </Field>
        <Field label="Name (optional)" htmlFor="ap-title">
          <Input id="ap-title" name="title" maxLength={160} placeholder="Pricing" />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2 pt-2">
          {onRemove && (
            <Button variant="ghost" size="sm" className="text-danger" onClick={onRemove}>
              Remove current page
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Adding…" : "Add page"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
