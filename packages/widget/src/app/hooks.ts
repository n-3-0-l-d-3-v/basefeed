import { normalizeTarget } from "@bn/anchor";
import { useEffect, useRef, useState } from "preact/hooks";

/** Re-render on scroll/resize (one frame at a most) and once a second for late layout shifts. */
export function useViewportTick(active: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => set((n) => n + 1));
    };
    window.addEventListener("scroll", on, { capture: true, passive: true });
    window.addEventListener("resize", on);
    const iv = window.setInterval(on, 1000);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on, { capture: true });
      window.removeEventListener("resize", on);
      window.clearInterval(iv);
    };
  }, [active]);
}

const BLOCKED = ["pointerdown", "pointerup", "mousedown", "mouseup", "auxclick", "dblclick", "submit", "contextmenu"];

/**
 * Comment mode: highlight whatever is under the cursor and turn a click into a pick instead of
 * letting the site handle it (links don't navigate, Webflow interactions don't fire).
 */
export function usePicker(enabled: boolean, host: Element, onPick: (el: Element, point: { x: number; y: number }) => void) {
  const [hover, setHover] = useState<Element | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    if (!enabled) {
      setHover(null);
      return;
    }
    const inWidget = (e: Event) => e.composedPath().includes(host);
    const at = (x: number, y: number): Element | null => {
      const el = document.elementFromPoint(x, y);
      if (!el || el === host || el === document.documentElement || el === document.body) return null;
      return normalizeTarget(el);
    };
    let raf = 0;
    const move = (e: PointerEvent) => {
      if (inWidget(e)) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setHover(at(e.clientX, e.clientY)));
    };
    const block = (e: Event) => {
      if (inWidget(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    const click = (e: MouseEvent) => {
      if (inWidget(e)) return;
      block(e);
      const el = at(e.clientX, e.clientY);
      if (el) pick.current(el, { x: e.clientX, y: e.clientY });
    };
    const cursor = document.createElement("style");
    cursor.textContent = "*{cursor:crosshair!important}";
    cursor.setAttribute("data-bn-root", "");
    document.head.appendChild(cursor);

    document.addEventListener("pointermove", move, { capture: true, passive: true });
    for (const t of BLOCKED) document.addEventListener(t, block, true);
    document.addEventListener("click", click, true);
    return () => {
      cancelAnimationFrame(raf);
      cursor.remove();
      document.removeEventListener("pointermove", move, { capture: true });
      for (const t of BLOCKED) document.removeEventListener(t, block, true);
      document.removeEventListener("click", click, true);
    };
  }, [enabled, host]);

  return hover;
}

/** Keep a floating card inside the viewport. */
export function placeCard(x: number, y: number, w = 340, h = 380) {
  const margin = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x + 22;
  if (left + w > vw - margin) left = x - w - 22;
  left = Math.max(margin, Math.min(left, vw - w - margin));
  const top = Math.max(margin, Math.min(y - 24, vh - h - margin));
  return { left: `${left}px`, top: `${top}px` };
}

export function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.composedPath()[0] as HTMLElement | undefined;
  if (!t) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}
