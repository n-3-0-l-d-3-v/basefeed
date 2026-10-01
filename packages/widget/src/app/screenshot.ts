const MAX_DATA_URL = 2_900_000;
const MIN_CONTEXT = { w: 360, h: 200 };

/** Small elements (an icon, a label) make useless screenshots, so frame them with an ancestor. */
function contextElement(target: Element): Element {
  let el = target;
  while (el.parentElement && el.parentElement !== document.body && el.parentElement !== document.documentElement) {
    const r = el.getBoundingClientRect();
    if (r.width >= MIN_CONTEXT.w && r.height >= MIN_CONTEXT.h) break;
    el = el.parentElement;
  }
  return el;
}

function backgroundOf(el: Element): string {
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const bg = getComputedStyle(cur).backgroundColor;
    if (bg && bg !== "transparent" && !/rgba\(.*,\s*0\)$/.test(bg)) return bg;
  }
  return "#ffffff";
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

/**
 * Best-effort JPEG of the commented area with the element outlined and the pin marked.
 * Returns undefined instead of failing: a comment must never be lost because a screenshot failed.
 */
export async function captureScreenshot(target: Element, offset: { x: number; y: number }): Promise<string | undefined> {
  try {
    const { domToCanvas } = await import("modern-screenshot");
    const frame = contextElement(target);
    const fr = frame.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    if (fr.width < 1 || fr.height < 1) return undefined;
    const scale = Math.min(1, 1400 / fr.width, 1600 / fr.height);
    const canvas = await timeout(domToCanvas(frame, { scale, backgroundColor: backgroundOf(frame), timeout: 4000 }), 6000);

    const g = canvas.getContext("2d");
    if (g) {
      const sx = canvas.width / fr.width;
      const sy = canvas.height / fr.height;
      const x = (tr.left - fr.left) * sx;
      const y = (tr.top - fr.top) * sy;
      g.lineWidth = Math.max(2, 3 * sx);
      g.strokeStyle = "#b8245f";
      g.strokeRect(x, y, tr.width * sx, tr.height * sy);
      g.fillStyle = "#ffacca";
      g.strokeStyle = "#ffffff";
      g.beginPath();
      g.arc(x + tr.width * sx * offset.x, y + tr.height * sy * offset.y, Math.max(6, 9 * sx), 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    for (const q of [0.82, 0.6, 0.4]) {
      const data = canvas.toDataURL("image/jpeg", q);
      if (data.length <= MAX_DATA_URL) return data;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
