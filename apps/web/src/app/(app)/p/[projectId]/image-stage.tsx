"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cx, IconButton, Textarea } from "@/components/ui";
import type { DashboardComment } from "@/lib/data";
import { createImageComment, imageUrl } from "../../actions";

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

/** An uploaded design (a Figma export, a screenshot) that the team pins comments on directly. */
export function ImageStage({
  projectId,
  page,
  comments,
  selectedId,
  mode,
  zoom,
  onCreated,
  onSelect,
}: {
  projectId: string;
  page: { id: string; title: string; image_path: string | null };
  comments: DashboardComment[];
  selectedId: string | null;
  mode: "comment" | "browse";
  zoom: number | "fit";
  onCreated: (c: DashboardComment) => void;
  onSelect: (id: string) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);

  useEffect(() => {
    if (page.image_path) void imageUrl(page.image_path).then(setSrc);
  }, [page.image_path]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxWidth(e!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = natural && boxWidth ? Math.min(1, (boxWidth - 48) / natural.w) : 1;
  const scale = zoom === "fit" ? fit : zoom;
  const width = natural ? Math.round(natural.w * scale) : undefined;

  const send = async () => {
    if (!draft || !body.trim() || busy) return;
    setBusy(true);
    setError(null);
    const r = await createImageComment(projectId, page.id, { body: body.trim(), priority, pin: draft });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onCreated(r.data);
    setDraft(null);
    setBody("");
    setPriority("medium");
  };

  return (
    <div ref={box} className="absolute inset-0 overflow-auto">
      <div className="flex min-h-full justify-center p-5">
        {!src ? (
          <p className="self-center text-[13px] text-muted">Loading the design…</p>
        ) : (
          <div className="relative h-fit shrink-0 overflow-visible rounded-xl bg-panel shadow-[var(--shadow-pop)]" style={{ width }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URL from private storage */}
            <img
              src={src}
              alt={page.title}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              onClick={(e) => {
                if (mode !== "comment") return;
                const r = e.currentTarget.getBoundingClientRect();
                setDraft({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
              }}
              className={cx("block w-full select-none rounded-xl", mode === "comment" && "cursor-crosshair")}
              draggable={false}
            />
            {comments
              .filter((c) => c.pin)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-label={`Comment ${c.number}`}
                  onClick={() => onSelect(c.id)}
                  style={{ left: `${c.pin!.x * 100}%`, top: `${c.pin!.y * 100}%` }}
                  className={cx(
                    "tabular absolute -ml-0.5 -mt-7 grid h-7 min-w-7 origin-bottom-left place-items-center rounded-[14px_14px_14px_3px] border-2 border-white px-1.5 text-[12px] font-bold shadow-[0_4px_14px_rgb(10_10_10/0.22)] transition-transform hover:scale-110",
                    c.id === selectedId ? "scale-110 bg-night text-pink" : c.status === "resolved" ? "bg-[#e4e1d4] text-muted" : "bg-pink text-plum",
                  )}
                >
                  {c.number}
                </button>
              ))}
            {draft && (
              <>
                <span
                  aria-hidden
                  style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}
                  className="absolute -ml-0.5 -mt-7 grid h-7 min-w-7 place-items-center rounded-[14px_14px_14px_3px] border-2 border-white bg-night px-1.5 text-[12px] font-bold text-accent"
                >
                  +
                </span>
                <div
                  role="dialog"
                  aria-label="New comment"
                  style={{ left: `min(calc(${draft.x * 100}% + 16px), calc(100% - 320px))`, top: `calc(${draft.y * 100}% + 8px)` }}
                  className="absolute z-10 w-80 rounded-2xl bg-panel p-3 shadow-[var(--shadow-pop)]"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="eyebrow">New comment on the design</span>
                    <IconButton aria-label="Cancel" onClick={() => setDraft(null)} className="size-7">
                      <X />
                    </IconButton>
                  </div>
                  <Textarea
                    autoFocus
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
                      if (e.key === "Escape") setDraft(null);
                    }}
                    placeholder="What should change?"
                    className="min-h-20"
                    maxLength={5000}
                  />
                  <div className="mt-2 flex items-center gap-1.5">
                    {PRIORITIES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        aria-pressed={priority === p}
                        onClick={() => setPriority(p)}
                        className={cx("rounded-full px-2.5 py-0.5 text-[12px] font-medium ring-1 ring-inset", priority === p ? "bg-night text-white ring-night" : "text-muted ring-line-strong hover:text-ink")}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={!body.trim() || busy}
                      onClick={() => void send()}
                      className="ml-auto h-8 rounded-[10px] bg-accent px-3.5 text-[13px] font-medium text-accent-ink disabled:opacity-45"
                    >
                      {busy ? "Sending…" : "Send"}
                    </button>
                  </div>
                  {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
