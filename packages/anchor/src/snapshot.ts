import { collapse } from "./text";

export const TRACKED_STYLES = [
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "color",
  "background-color",
  "text-align",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "gap",
  "border-radius",
  "opacity",
  "display",
] as const;

export interface Snapshot {
  v: 1;
  viewportWidth: number;
  text: string;
  src: string | null;
  size: { w: number; h: number };
  styles: Record<string, string>;
}

export interface Change {
  field: string;
  from: string;
  to: string;
}

export interface SnapshotDiff {
  /** False when the element is being viewed at a different breakpoint than when it was commented on. */
  comparable: boolean;
  changes: Change[];
}

const SIZE_TOLERANCE_PX = 2;

/** Webflow's default breakpoints. */
export function breakpoint(width: number): "desktop" | "tablet" | "mobile-landscape" | "mobile-portrait" {
  if (width >= 992) return "desktop";
  if (width >= 768) return "tablet";
  if (width >= 480) return "mobile-landscape";
  return "mobile-portrait";
}

export function takeSnapshot(el: Element): Snapshot {
  const win = el.ownerDocument.defaultView;
  const cs = win?.getComputedStyle(el);
  const styles: Record<string, string> = {};
  if (cs) for (const p of TRACKED_STYLES) styles[p] = cs.getPropertyValue(p).trim();
  const r = el.getBoundingClientRect();
  return {
    v: 1,
    viewportWidth: win?.innerWidth ?? 0,
    text: collapse(el.textContent ?? "").trim().slice(0, 500),
    src: el.getAttribute("src"),
    size: { w: Math.round(r.width), h: Math.round(r.height) },
    styles,
  };
}

function short(s: string, max = 80): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function diffSnapshot(before: Snapshot, after: Snapshot): SnapshotDiff {
  const comparable = breakpoint(before.viewportWidth) === breakpoint(after.viewportWidth);
  const changes: Change[] = [];
  if (before.text !== after.text) changes.push({ field: "text", from: short(before.text), to: short(after.text) });
  if (before.src !== after.src) changes.push({ field: "image", from: before.src ?? "none", to: after.src ?? "none" });
  if (!comparable) return { comparable, changes };

  for (const p of TRACKED_STYLES) {
    const a = before.styles[p] ?? "";
    const b = after.styles[p] ?? "";
    if (a !== b) changes.push({ field: p, from: a || "unset", to: b || "unset" });
  }
  if (Math.abs(before.viewportWidth - after.viewportWidth) <= 16) {
    if (Math.abs(before.size.w - after.size.w) > SIZE_TOLERANCE_PX) changes.push({ field: "width", from: `${before.size.w}px`, to: `${after.size.w}px` });
    if (Math.abs(before.size.h - after.size.h) > SIZE_TOLERANCE_PX) changes.push({ field: "height", from: `${before.size.h}px`, to: `${after.size.h}px` });
  }
  return { comparable, changes };
}
