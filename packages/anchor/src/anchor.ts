import { DocIndex, normalizeTarget, tagOf } from "./doc-index";
import { dice, headMatch, jaccard, tailMatch } from "./text";

export interface Anchor {
  v: 1;
  /** Content identity at capture time (see DocIndex.key). */
  key: string;
  tag: string;
  kind: "leaf" | "container";
  /** Normalized text: full text for leaves, direct text for containers. */
  text: string;
  /** Human-readable text excerpt, original casing. */
  excerpt: string;
  classes: string[];
  attrs: Record<string, string>;
  /** First 300 normalized characters of the element's full text. */
  digest: string;
  prefix: string;
  suffix: string;
  path: string;
  parentSig: string;
  /** Best-effort readable selector for humans and AI agents; not used for resolution. */
  selector: string;
  /** No other element shared this content key at capture. */
  unique: boolean;
  /**
   * For repeated content ("Learn more" on every card): the nearest ancestor whose full text is
   * unique on the page and that contains exactly one such element (e.g. "the Smart dispatch card"),
   * and the path from it down to the element.
   */
  scope: { tag: string; textHash: string; rel: string; prefix: string; suffix: string } | null;
  /** Click position inside the element's box, 0..1 on each axis. */
  offset: { x: number; y: number };
}

export type Signal = "path" | "prefix" | "suffix" | "parent" | "scope";

export type Resolution =
  | { status: "attached"; element: Element; signals: Signal[] }
  | { status: "suggested"; element: Element; score: number; reason: "moved" | "changed" | "ambiguous" }
  | { status: "detached" };

const SUGGEST_THRESHOLD = 0.5;
const CONTAINER_DIGEST_MIN = 0.8;

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
}

const SAFE_IDENT = /^-?[_a-zA-Z][_a-zA-Z0-9-]*$/;
const GENERATED_ID = /\d{3,}|^[a-f0-9-]{8,}$|^(w-node-|react-|radix-|:r)/;

function readableSelector(el: Element, index: DocIndex): string {
  const doc = el.ownerDocument;
  const id = el.id;
  if (id && SAFE_IDENT.test(id) && !GENERATED_ID.test(id) && doc.querySelectorAll(`#${id}`).length === 1) return `#${id}`;
  const classes = index.classes(el).filter((c) => SAFE_IDENT.test(c));
  if (classes.length) {
    const sel = `${tagOf(el)}.${classes.join(".")}`;
    if (doc.querySelectorAll(sel).length === 1) return sel;
  }
  return index.path(el);
}

function isInformative(a: Pick<Anchor, "kind" | "text" | "attrs" | "digest">): boolean {
  if (a.kind === "leaf") return a.text.length >= 16 || "src" in a.attrs || "data-w-id" in a.attrs;
  return a.digest.length >= 16;
}

export function capture(target: Element, point?: { x: number; y: number }, index?: DocIndex): Anchor {
  const el = normalizeTarget(target);
  const idx = index ?? new DocIndex(el.ownerDocument);
  if (!idx.has(el)) throw new Error("cannot anchor an element outside the indexed document");

  const kind = idx.isLeaf(el) ? "leaf" : "container";
  const key = idx.key(el);
  let offset = { x: 0.5, y: 0.5 };
  if (point) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) offset = { x: clamp01((point.x - r.left) / r.width), y: clamp01((point.y - r.top) / r.height) };
  }

  return {
    v: 1,
    key,
    tag: tagOf(el),
    kind,
    text: (kind === "leaf" ? idx.text(el) : idx.ownText(el)).slice(0, 500),
    excerpt: idx.excerpt(el),
    classes: idx.classes(el),
    attrs: idx.attrs(el),
    digest: idx.digest(el),
    prefix: idx.prefix(el),
    suffix: idx.suffix(el),
    path: idx.path(el),
    parentSig: idx.parentSig(el),
    selector: readableSelector(el, idx),
    unique: idx.withKey(key).length === 1,
    scope: idx.withKey(key).length === 1 ? null : findScope(el, key, idx),
    offset,
  };
}

const SCOPE_MIN_TEXT = 6;

function keyCountWithin(root: Element, key: string, idx: DocIndex): number {
  let n = 0;
  for (const d of Array.from(root.querySelectorAll("*"))) if (idx.has(d) && idx.key(d) === key) n++;
  return n;
}

function findScope(el: Element, key: string, idx: DocIndex): Anchor["scope"] {
  const own = idx.text(el);
  for (let a = el.parentElement; a && a !== idx.body && idx.has(a); a = a.parentElement) {
    // Containing more than one twin here means every higher ancestor does too.
    if (keyCountWithin(a, key, idx) !== 1) return null;
    const text = idx.text(a);
    // The container must say something of its own ("Smart dispatch…"), not just repeat the label.
    const distinctive = own ? text.split(own).join("").replace(/\s+/g, "") : text.replace(/\s+/g, "");
    if (distinctive.length < SCOPE_MIN_TEXT) continue;
    const tag = tagOf(a);
    const textHash = idx.textHash(a);
    if (idx.withTag(tag).filter((o) => idx.textHash(o) === textHash).length !== 1) continue;
    return { tag, textHash, rel: idx.relPath(a, el), prefix: idx.prefix(a), suffix: idx.suffix(a) };
  }
  return null;
}

/**
 * The element at the recorded path inside the one ancestor that still has exactly the recorded
 * text. Wrapping that ancestor in a new element yields nested matches with the same text; the
 * innermost is the original (the wrapper adds no text).
 */
function resolveScope(a: Anchor, idx: DocIndex): Element | null {
  if (!a.scope) return null;
  const { tag, textHash, rel, prefix, suffix } = a.scope;
  const matches = idx.withTag(tag).filter((o) => idx.textHash(o) === textHash);
  const innermost = matches.filter((m) => !matches.some((o) => o !== m && m.contains(o)));
  if (innermost.length !== 1) return null;
  const scope = innermost[0]!;
  // The container must also still sit in the same neighbourhood on at least one side (an empty side,
  // at the page edge, matches anything and proves nothing).
  const near = (prefix.trim() && tailMatch(idx.prefix(scope), prefix)) || (suffix.trim() && headMatch(idx.suffix(scope), suffix));
  if (!near) return null;
  const el = idx.followRelPath(scope, rel);
  return el && idx.key(el) === a.key ? el : null;
}

function signalsFor(el: Element, a: Anchor, idx: DocIndex): Signal[] {
  const s: Signal[] = [];
  if (idx.path(el) === a.path) s.push("path");
  if (tailMatch(idx.prefix(el), a.prefix)) s.push("prefix");
  if (headMatch(idx.suffix(el), a.suffix)) s.push("suffix");
  if (a.parentSig && idx.parentSig(el) === a.parentSig) s.push("parent");
  return s;
}

/**
 * Whether a content-identical candidate carries enough independent positional evidence to be
 * treated as the same element. The rules get stricter as the anchor carries less information,
 * because low-information elements (short labels, empty boxes) are easy to confuse with neighbours.
 */
function eligible(a: Anchor, el: Element, sig: Signal[], idx: DocIndex, candidates: number): boolean {
  if (a.kind === "container" && dice(idx.digest(el), a.digest) < CONTAINER_DIGEST_MIN) return false;
  // Content that is unique both at capture and now. Elements with no content at all (an empty div,
  // a spacer) carry no identity — any emptied element would match — so they never qualify.
  const empty = a.text === "" && a.digest === "" && Object.keys(a.attrs).length === 0;
  if (a.unique && candidates === 1 && !empty) {
    if (a.kind === "container") {
      // No classes, attributes or text of its own: a classless wrapper around it (or inside it) has
      // the same key and the same text, so with one nearby only exact structural agreement counts.
      const bare = a.classes.length === 0 && Object.keys(a.attrs).length === 0 && a.text === "";
      if (bare && hasNestedLookalike(a, el, idx)) return sig.includes("path") && sig.includes("parent");
      return sig.includes("path") || sig.includes("parent");
    }
    // A shell (a box whose whole text sits in one child) can be produced by wrapping any element
    // that has the same text, and it inherits that element's surroundings. Matching text and
    // neighbouring text therefore prove nothing here: only the exact structural slot does.
    if (isShell(el, idx)) return sig.includes("path") && sig.includes("parent");
    // A close variant of the original still on the page (edited in place, or re-wrapped) means this
    // candidate may be a copy or a new wrapper: demand exact structural agreement.
    if (hasNearVariant(a, el, idx)) return sig.includes("path") && sig.includes("parent");
    if (sig.some((x) => (x !== "prefix" || a.prefix.trim()) && (x !== "suffix" || a.suffix.trim()))) return true;
    // Only "nothing before/after it" (the page edge): a new wrapper inside the original matches that
    // too, so it counts only when no such nesting is possible.
    if (sig.length > 0) return !hasNestedLookalike(a, el, idx);
    // Content-only match: the element moved. Only for distinctive content.
    return isInformative(a);
  }
  // Repeated content ("Learn more" ×3): surrounding text can be inherited by a twin — moving one
  // twin past another leaves the page text unchanged — so only exact structural agreement counts.
  return sig.includes("path") && sig.includes("parent");
}

const NEAR_VARIANT = 0.7;

/** A leaf that is only a shell around one child element holding all of its text. */
function isShell(el: Element, idx: DocIndex): boolean {
  const text = idx.text(el);
  return text !== "" && Array.from(el.children).some((c) => idx.has(c) && idx.text(c) === text);
}

/** A same-tag element around or inside this one that also carries the anchor's content: a wrapper and what it wraps. */
function hasNestedLookalike(a: Anchor, el: Element, idx: DocIndex): boolean {
  return idx.withTag(a.tag).some((o) => {
    if (o === el || !(o.contains(el) || el.contains(o))) return false;
    return a.kind === "leaf" ? a.text !== "" && idx.text(o).includes(a.text) : dice(idx.digest(o), a.digest) >= CONTAINER_DIGEST_MIN;
  });
}

function hasNearVariant(a: Anchor, el: Element, idx: DocIndex): boolean {
  return idx.withTag(a.tag).some((o) => {
    if (o === el) return false;
    const text = idx.text(o).slice(0, 500);
    if (dice(text, a.text) >= NEAR_VARIANT) return true;
    // The original still in its exact slot with text added: a short label plus a long addition falls
    // under the similarity cut, yet a new wrapper inside it would now look exactly like the original.
    return a.text !== "" && text !== a.text && text.includes(a.text) && idx.path(o) === a.path;
  });
}

function attrsSimilarity(a: Record<string, string>, b: Record<string, string>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  if (keys.size === 0) return 1;
  let same = 0;
  for (const k of keys) if (a[k] === b[k]) same++;
  return same / keys.size;
}

function score(a: Anchor, el: Element, idx: DocIndex, sig: Signal[]): number {
  let content: number;
  if (idx.key(el) === a.key) content = 1;
  else {
    const text = a.kind === "leaf" ? idx.text(el).slice(0, 500) : idx.digest(el);
    const ref = a.kind === "leaf" ? a.text : a.digest;
    content = 0.5 * dice(text, ref) + 0.3 * jaccard(idx.classes(el), a.classes) + 0.2 * attrsSimilarity(idx.attrs(el), a.attrs);
  }
  return 0.6 * content + 0.4 * (sig.length / 4);
}

export function resolve(a: Anchor, index: DocIndex): Resolution {
  const candidates = index.withKey(a.key);
  const ranked = candidates
    .map((el) => ({ el, sig: signalsFor(el, a, index) }))
    .map((c) => ({ ...c, ok: eligible(a, c.el, c.sig, index, candidates.length), s: score(a, c.el, index, c.sig) }))
    .sort((x, y) => y.s - x.s);

  const ok = ranked.filter((c) => c.ok);
  if (ok.length === 1) return { status: "attached", element: ok[0]!.el, signals: ok[0]!.sig };
  // Repeated content whose structure shifted (a card added before it, a banner above): the unique
  // container it sits in still identifies it exactly.
  const scoped = ok.length === 0 || ok.length > 1 ? resolveScope(a, index) : null;
  if (scoped && (ok.length === 0 || ok.some((c) => c.el === scoped))) {
    const sig = ranked.find((c) => c.el === scoped)?.sig ?? [];
    return { status: "attached", element: scoped, signals: [...sig, "scope"] };
  }
  if (ok.length > 1) return { status: "suggested", element: ok[0]!.el, score: ok[0]!.s, reason: "ambiguous" };
  if (ranked.length > 0) return { status: "suggested", element: ranked[0]!.el, score: ranked[0]!.s, reason: "moved" };

  let best: { el: Element; s: number } | null = null;
  for (const el of index.withTag(a.tag)) {
    const s = score(a, el, index, signalsFor(el, a, index));
    if (!best || s > best.s) best = { el, s };
  }
  if (best && best.s >= SUGGEST_THRESHOLD) return { status: "suggested", element: best.el, score: best.s, reason: "changed" };
  return { status: "detached" };
}

/** Resolve many anchors against one index (one pass over the DOM, shared caches). */
export function resolveAll(anchors: readonly Anchor[], doc: Document, index?: DocIndex): Resolution[] {
  const idx = index ?? new DocIndex(doc);
  return anchors.map((a) => resolve(a, idx));
}

/** Viewport coordinates for a pin, given a resolved element and the stored offset. */
export function pinPoint(el: Element, offset: Anchor["offset"]): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width * offset.x, y: r.top + r.height * offset.y };
}
