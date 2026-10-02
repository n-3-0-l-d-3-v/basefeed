"use client";

import { FileText, FolderOpen, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { search, type SearchHit } from "@/app/(app)/search-actions";
import { Pin } from "./pin";
import { cx, Kbd } from "./ui";

/** Ctrl/⌘ K: jump to any project, page or comment (by text or "#12"). */
export function CommandPalette() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("bn:open-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("bn:open-search", onOpen);
    };
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setTimeout(() => input.current?.focus(), 0);
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await search(q);
      if (!live) return;
      setHits(r);
      setActive(0);
      setLoading(false);
    }, 160);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, open]);

  const go = (hit: SearchHit | undefined) => {
    if (!hit) return;
    setOpen(false);
    setQ("");
    router.push(hit.href);
  };

  return (
    <dialog
      ref={dialog}
      aria-label="Search"
      onClose={() => setOpen(false)}
      onClick={(e) => {
        if (e.target === dialog.current) setOpen(false);
      }}
      className="mx-auto mt-[12vh] w-[calc(100vw-32px)] max-w-xl rounded-2xl bg-panel p-0 text-ink shadow-[var(--shadow-pop)]"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search aria-hidden className="size-4 shrink-0 text-muted" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(hits.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(hits[active]);
            }
          }}
          placeholder="Search comments, pages and projects, or type #12"
          aria-label="Search"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls="palette-results"
          className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/70"
        />
        <Kbd>Esc</Kbd>
      </div>
      <ul id="palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
        {hits.length === 0 ? (
          <li className="px-3 py-8 text-center text-[13px] text-muted">
            {q.trim().length < 2 ? "Start typing to search." : loading ? "Searching…" : "Nothing matches that."}
          </li>
        ) : (
          hits.map((h, i) => (
            <li key={`${h.kind}:${h.id}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h)}
                className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left", i === active && "bg-sunken")}
              >
                {h.kind === "comment" ? (
                  <Pin number={h.number} state={h.status === "resolved" ? "resolved" : "open"} className="mt-0" />
                ) : h.kind === "page" ? (
                  <FileText aria-hidden className="size-4 shrink-0 text-muted" />
                ) : (
                  <FolderOpen aria-hidden className="size-4 shrink-0 text-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]">{h.title}</span>
                  <span className="block truncate text-[12px] text-muted">{h.sub}</span>
                </span>
                <span className="eyebrow">{h.kind}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </dialog>
  );
}

export function SearchButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("bn:open-search"))}
      className="hidden h-8 items-center gap-2 rounded-lg bg-white/[0.07] px-2.5 text-[12px] text-white/60 ring-1 ring-inset ring-white/10 hover:text-white md:flex"
    >
      <Search aria-hidden className="size-3.5" />
      Search
      <span className="rounded border border-white/15 px-1 font-mono text-[10px]">Ctrl K</span>
    </button>
  );
}
