"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "./ui";

/** Native <dialog>: focus trapping, Esc and the top layer come from the browser, not a library. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
      className={`m-auto w-[calc(100vw-32px)] ${wide ? "max-w-2xl" : "max-w-md"} rounded-2xl bg-panel p-0 text-ink shadow-[var(--shadow-pop)]`}
    >
      <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
        <div>
          <h2 className="text-lg font-medium">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
        </div>
        <IconButton aria-label="Close" onClick={onClose} className="-mr-2 -mt-1">
          <X />
        </IconButton>
      </div>
      <div className="px-6 pb-6 pt-3">{children}</div>
    </dialog>
  );
}
