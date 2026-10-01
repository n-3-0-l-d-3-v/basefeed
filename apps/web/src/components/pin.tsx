import { cx } from "./ui";

/** The same marker the widget draws on the client's site, so a comment looks identical in both places. */
export function Pin({ number, state = "open", className }: { number: number; state?: "open" | "changed" | "resolved"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "tabular mt-0.5 grid h-6 min-w-6 shrink-0 place-items-center rounded-[12px_12px_12px_3px] px-1.5 text-[11px] font-bold",
        state === "open" && "bg-pink text-plum",
        state === "changed" && "bg-panel text-pink-deep outline-[1.5px] outline-dashed outline-pink-deep -outline-offset-[1.5px]",
        state === "resolved" && "bg-sunken text-muted ring-1 ring-line",
        className,
      )}
    >
      {number}
    </span>
  );
}
