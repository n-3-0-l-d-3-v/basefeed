import { collapse, hash, norm } from "./text";

export const KEY_ATTRS = [
  "src",
  "href",
  "alt",
  "aria-label",
  "title",
  "name",
  "type",
  "placeholder",
  "role",
  "data-w-id",
  "for",
] as const;

const INLINE = new Set([
  "a", "abbr", "b", "br", "code", "em", "i", "mark", "small", "span", "strong", "sub", "sup", "u", "s", "time", "wbr",
]);
const ATOMIC = new Set(["img", "svg", "video", "canvas", "iframe", "input", "textarea", "select", "picture", "audio"]);
const SKIP = new Set(["script", "style", "noscript", "template", "head", "link", "meta"]);

const CONTEXT_CHARS = 64;

export interface IndexOptions {
  /** Elements (and their subtrees) the index should pretend do not exist, e.g. the widget's own UI. */
  ignore?: (el: Element) => boolean;
}

const defaultIgnore = (el: Element) => el.hasAttribute("data-bn-root");

export function tagOf(el: Element): string {
  return el.tagName.toLowerCase();
}

/** Clicks land on inner SVG paths; the meaningful target is the outermost <svg>. */
export function normalizeTarget(el: Element): Element {
  let svg: Element | null = el.closest("svg");
  while (svg?.parentElement?.closest("svg")) svg = svg.parentElement.closest("svg");
  return svg ?? el;
}

function cleanUrl(raw: string): string {
  const q = raw.search(/[?]/);
  return q === -1 ? raw : raw.slice(0, q);
}

/**
 * A single pass over the document that records, for every element, where its text sits in a
 * normalized document-wide text stream. Everything the anchoring engine compares (element text,
 * surrounding context, content keys) is derived from this one pass, so capture and resolve see
 * the page identically.
 */
export class DocIndex {
  readonly body: Element;
  private stream = "";
  private readonly spans = new Map<Element, [number, number]>();
  private readonly order: Element[] = [];
  private readonly keys = new Map<Element, string>();
  private byKey: Map<string, Element[]> | null = null;
  private readonly ignore: (el: Element) => boolean;

  constructor(doc: Document, opts: IndexOptions = {}) {
    this.ignore = opts.ignore ?? defaultIgnore;
    this.body = doc.body;
    this.walk(doc.body);
  }

  private push(text: string) {
    let t = collapse(text);
    if (!t) return;
    if (this.stream === "" || this.stream.endsWith(" ")) t = t.replace(/^ /, "");
    this.stream += t;
  }

  private sep() {
    if (this.stream && !this.stream.endsWith(" ")) this.stream += " ";
  }

  private walk(el: Element) {
    const tag = tagOf(el);
    const block = !INLINE.has(tag);
    if (block) this.sep();
    const start = this.stream.length;
    this.order.push(el);
    if (!ATOMIC.has(tag)) {
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === 3) this.push((child as Text).data);
        else if (child.nodeType === 1) {
          const c = child as Element;
          if (SKIP.has(tagOf(c)) || this.ignore(c)) continue;
          this.walk(c);
        }
      }
    }
    this.spans.set(el, [start, this.stream.length]);
    if (block) this.sep();
  }

  has(el: Element): boolean {
    return this.spans.has(el);
  }

  elements(): readonly Element[] {
    return this.order;
  }

  private span(el: Element): [number, number] {
    const s = this.spans.get(el);
    if (!s) throw new Error("element is not part of this index");
    return s;
  }

  text(el: Element): string {
    const [s, e] = this.span(el);
    return norm(this.stream.slice(s, e));
  }

  excerpt(el: Element, max = 160): string {
    const [s, e] = this.span(el);
    return collapse(this.stream.slice(s, e)).trim().slice(0, max);
  }

  prefix(el: Element): string {
    const [s] = this.span(el);
    return this.stream.slice(Math.max(0, s - CONTEXT_CHARS), s);
  }

  suffix(el: Element): string {
    const [, e] = this.span(el);
    return this.stream.slice(e, e + CONTEXT_CHARS);
  }

  isLeaf(el: Element): boolean {
    if (ATOMIC.has(tagOf(el))) return true;
    for (const c of Array.from(el.children)) {
      if (!this.spans.has(c)) continue;
      if (!INLINE.has(tagOf(c))) return false;
    }
    return true;
  }

  ownText(el: Element): string {
    let out = "";
    for (const n of Array.from(el.childNodes)) if (n.nodeType === 3) out += (n as Text).data + " ";
    return norm(out);
  }

  attrs(el: Element): Record<string, string> {
    const out: Record<string, string> = {};
    for (const name of KEY_ATTRS) {
      const v = el.getAttribute(name);
      if (v == null || v === "") continue;
      out[name] = name === "src" || name === "href" ? cleanUrl(v.trim()) : collapse(v).trim();
    }
    return out;
  }

  /** Classes that identify an element; runtime state classes (Webflow `w--current`, `w--open`) are excluded. */
  classes(el: Element): string[] {
    return [...new Set(Array.from(el.classList).filter((c) => !c.startsWith("w--") && !c.startsWith("bn-")))].sort();
  }

  digest(el: Element): string {
    return this.text(el).slice(0, 300);
  }

  private readonly textHashes = new Map<Element, string>();

  /** Hash of the element's full normalized text (unlike digest, not truncated). */
  textHash(el: Element): string {
    let h = this.textHashes.get(el);
    if (h === undefined) {
      h = hash(this.text(el));
      this.textHashes.set(el, h);
    }
    return h;
  }

  /** `tag:nth-of-type(n)` steps from an ancestor down to a descendant. */
  relPath(ancestor: Element, el: Element): string {
    const steps: string[] = [];
    for (let cur: Element | null = el; cur && cur !== ancestor; cur = cur.parentElement) {
      const tag = tagOf(cur);
      let n = 1;
      for (let s = cur.previousElementSibling; s; s = s.previousElementSibling) if (tagOf(s) === tag) n++;
      steps.unshift(`${tag}:nth-of-type(${n})`);
    }
    return steps.join(" > ");
  }

  followRelPath(ancestor: Element, rel: string): Element | null {
    if (!rel) return ancestor;
    let cur: Element | null = ancestor;
    for (const step of rel.split(" > ")) {
      const m = /^(.+):nth-of-type\((\d+)\)$/.exec(step);
      if (!m || !cur) return null;
      const [, tag, nth] = m;
      cur = Array.from(cur.children).filter((c) => tagOf(c) === tag)[Number(nth) - 1] ?? null;
    }
    return cur && this.has(cur) ? cur : null;
  }

  key(el: Element): string {
    const cached = this.keys.get(el);
    if (cached) return cached;
    const tag = tagOf(el);
    const attrs = this.attrs(el);
    const attrsKey = Object.keys(attrs)
      .sort()
      .map((k) => `${k}=${attrs[k]}`)
      .join("&");
    let key: string;
    if (tag === "svg") key = `L|svg|${hash(norm(el.innerHTML))}|${attrsKey}`;
    else if (this.isLeaf(el)) key = `L|${tag}|${hash(this.text(el))}|${attrsKey}`;
    else key = `C|${tag}|${this.classes(el).join(".")}|${attrsKey}|${hash(this.ownText(el))}`;
    this.keys.set(el, key);
    return key;
  }

  /** CSS-valid structural path, e.g. `body > div:nth-of-type(2) > h1:nth-of-type(1)`. */
  path(el: Element): string {
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur && cur !== this.body) {
      const tag = tagOf(cur);
      let n = 1;
      let sib = cur.previousElementSibling;
      while (sib) {
        if (tagOf(sib) === tag) n++;
        sib = sib.previousElementSibling;
      }
      parts.unshift(`${tag}:nth-of-type(${n})`);
      cur = cur.parentElement;
    }
    parts.unshift("body");
    return parts.join(" > ");
  }

  /** Fingerprint of the parent's children by content, so removing/replacing a sibling changes it. */
  parentSig(el: Element): string {
    const parent = el.parentElement;
    if (!parent || !this.spans.has(parent)) return "";
    const kids = Array.from(parent.children).filter((c) => this.spans.has(c));
    return hash(kids.map((c) => this.key(c)).join("|"));
  }

  withKey(key: string): readonly Element[] {
    if (!this.byKey) {
      this.byKey = new Map();
      for (const el of this.order) {
        const k = this.key(el);
        const list = this.byKey.get(k);
        if (list) list.push(el);
        else this.byKey.set(k, [el]);
      }
    }
    return this.byKey.get(key) ?? [];
  }

  withTag(tag: string): Element[] {
    return this.order.filter((el) => tagOf(el) === tag);
  }
}
