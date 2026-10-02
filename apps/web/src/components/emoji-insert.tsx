"use client";

import { Smile } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { IconButton } from "./ui";

const EMOJI = ["👍", "👀", "✅", "🎉", "🙏", "🔥", "❤️", "😊", "😂", "🤔", "💡", "⚠️", "🚀", "👌", "✨", "👏"];

/** Quick-insert for the handful of emoji people actually use in feedback threads, at the caret. */
export function EmojiInsert({
  target,
  value,
  onChange,
  className,
}: {
  target: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const insert = (emoji: string) => {
    const el = target.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + emoji + value.slice(end));
    setOpen(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  return (
    <div ref={root} className={className ? `relative ${className}` : "relative"}>
      <IconButton aria-label="Insert emoji" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Smile />
      </IconButton>
      {open && (
        <div role="menu" aria-label="Emoji" className="absolute bottom-full left-0 z-20 mb-1 grid w-max grid-cols-8 gap-0.5 rounded-xl bg-panel p-1.5 shadow-[var(--shadow-pop)]">
          {EMOJI.map((e) => (
            <button key={e} type="button" role="menuitem" aria-label={e} onClick={() => insert(e)} className="grid size-8 place-items-center rounded-lg text-[18px] hover:bg-sunken">
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
