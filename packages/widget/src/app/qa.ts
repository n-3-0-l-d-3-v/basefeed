import type { QaRule } from "@bn/shared";

/**
 * Page checks a studio runs before launch, done on the real page in the reviewer's browser: plain
 * DOM inspection, no AI, so the same page always gives the same findings. Each finding points at
 * one element and can be filed as a comment pinned to it.
 */
export interface Finding {
  rule: QaRule;
  el: Element;
  /** One sentence a designer or developer can act on. */
  message: string;
}

export interface AuditOptions {
  /** Elements to leave out (the feedback widget itself). */
  skip?: (el: Element) => boolean;
  /** Whether an element is rendered. Injected so the structural rules can be tested without layout. */
  visible?: (el: Element) => boolean;
  /** Rules that need real layout and paint (overflow, contrast, image loading). Off in unit tests. */
  layout?: boolean;
}

const MAX_PER_RULE = 8;
const quote = (s: string) => `"${s.replace(/\s+/g, " ").trim().slice(0, 40)}"`;
const name = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

/** Text a screen reader would announce for a link or button. */
function accessibleName(el: Element): string {
  const label = el.getAttribute("aria-label") ?? el.getAttribute("title") ?? "";
  if (label.trim()) return label.trim();
  const alt = Array.from(el.querySelectorAll("img[alt], svg title")).map((n) => (n.getAttribute("alt") ?? n.textContent ?? "").trim());
  return (name(el) || alt.join(" ")).trim();
}

function parseColor(value: string): { r: number; g: number; b: number; a: number } | null {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(value.trim());
  if (!m) return null; // other colour spaces: don't guess
  const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { r: +m[1]!, g: +m[2]!, b: +m[3]!, a };
}

function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio of the element's text against its nearest solid background; null when it can't be known. */
export function contrastOf(el: Element): number | null {
  const view = el.ownerDocument.defaultView;
  if (!view) return null;
  const style = view.getComputedStyle(el);
  const fg = parseColor(style.color);
  if (!fg || fg.a < 1) return null;
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const s = view.getComputedStyle(cur);
    if (s.backgroundImage && s.backgroundImage !== "none") return null; // text over an image or gradient
    const bg = parseColor(s.backgroundColor);
    if (!bg) return null;
    if (bg.a === 0) continue;
    if (bg.a < 1) return null;
    const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  }
  const page = luminance({ r: 255, g: 255, b: 255 });
  const text = luminance(fg);
  return (Math.max(page, text) + 0.05) / (Math.min(page, text) + 0.05);
}

export function audit(doc: Document, options: AuditOptions = {}): Finding[] {
  const skip = options.skip ?? (() => false);
  const visible = options.visible ?? ((el: Element) => el.getClientRects().length > 0);
  const layout = options.layout ?? true;
  const all = (selector: string) => Array.from(doc.body.querySelectorAll(selector)).filter((el) => !skip(el) && visible(el));
  const out: Finding[] = [];
  const add = (rule: QaRule, el: Element, message: string) => {
    if (out.filter((f) => f.rule === rule).length < MAX_PER_RULE) out.push({ rule, el, message });
  };

  for (const img of all("img:not([alt])")) {
    if (img.getAttribute("role") === "presentation" || img.getAttribute("aria-hidden") === "true") continue;
    add("alt", img, "This image has no alt text. Describe it, or mark it decorative with an empty alt.");
  }

  for (const a of all("a")) {
    const href = a.getAttribute("href");
    if (href === null || href.trim() === "" || href.trim() === "#" || /^javascript:/i.test(href.trim()))
      add("dead-link", a, `The link ${quote(accessibleName(a) || "(no text)")} goes nowhere (${href === null ? "no href" : `href="${href.trim()}"`}).`);
  }

  for (const el of all("a, button")) if (!accessibleName(el)) add("empty-control", el, `This ${el.localName === "a" ? "link" : "button"} has no text or label, so screen readers announce nothing.`);

  let previous = 0;
  let h1 = 0;
  for (const h of all("h1, h2, h3, h4, h5, h6")) {
    const level = Number(h.localName[1]);
    if (!name(h)) {
      add("heading-empty", h, `This ${h.localName.toUpperCase()} is empty.`);
      continue;
    }
    if (level === 1 && ++h1 > 1) add("heading-order", h, `There is more than one H1 on this page: ${quote(name(h))}.`);
    else if (previous && level > previous + 1) add("heading-order", h, `${quote(name(h))} is an H${level} right after an H${previous}; a level is skipped.`);
    previous = level;
  }

  const ids = new Map<string, number>();
  for (const el of all("[id]")) {
    const n = (ids.get(el.id) ?? 0) + 1;
    ids.set(el.id, n);
    if (el.id && n === 2) add("duplicate-id", el, `The id "${el.id}" is used more than once on this page.`);
  }

  for (const el of all("p, h1, h2, h3, h4, h5, h6, li, a, button, span, div")) {
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? "")
      .join(" ");
    if (/lorem ipsum|dolor sit amet/i.test(own)) add("placeholder", el, "Placeholder text (lorem ipsum) is still here.");
  }

  if (!layout) return out;
  const view = doc.defaultView!;

  for (const img of all("img[src]") as HTMLImageElement[]) if (img.complete && img.naturalWidth === 0) add("broken-image", img, "This image fails to load.");

  const width = doc.documentElement.clientWidth;
  if (doc.documentElement.scrollWidth > width + 1) {
    const wide = all("body *").filter((el) => el.getBoundingClientRect().right > width + 1);
    // The widest ancestor is the cause; its children merely sit inside it.
    for (const el of wide.filter((el) => !wide.includes(el.parentElement!)).slice(0, 3))
      add("overflow", el, `This is ${Math.round(el.getBoundingClientRect().right - width)}px wider than the screen at ${width}px, so the page scrolls sideways.`);
  }

  for (const el of all("p, h1, h2, h3, h4, h5, h6, li, a, button, span, label")) {
    const hasOwnText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 1);
    if (!hasOwnText) continue;
    const ratio = contrastOf(el);
    if (ratio === null) continue;
    const s = view.getComputedStyle(el);
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) add("contrast", el, `${quote(name(el))} has a contrast of ${ratio.toFixed(1)}:1; it needs ${large ? "3" : "4.5"}:1 to be readable.`);
  }

  return out;
}
