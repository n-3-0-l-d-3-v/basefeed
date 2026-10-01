import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { capture, DocIndex, resolve, type Anchor, type Resolution } from "../src";

/*
 * Random marketing-page-like DOMs with deliberately repetitive content (duplicate labels,
 * shared classes, repeated images), a random commented element, and random edits.
 *
 * Invariant: if the engine reports "attached", it is the element that was commented on, or an
 * exact duplicate of it that the page gives no way to tell apart:
 *   - same content in exactly the original's structural slot (same position, same parent
 *     children), e.g. the first of two identical buttons after the original first one was deleted
 *     and the other duplicated; or
 *   - an exact copy made of the commented node (byte-identical; which one is "the original" is
 *     not observable).
 * It never attaches to an element with different content. Content created by edits uses a
 * separate vocabulary, so edits never forge an exact copy.
 */

const TEXTS = [
  "Learn more",
  "Learn more",
  "Get started",
  "Pricing",
  "Book a demo",
  "FAQ",
  "Trusted by 200+ B2B teams worldwide",
  "Turn your website into your best salesperson",
  "We build Webflow sites for B2B tech",
  "",
];
const CLASSES = ["card", "button", "row", "hero", "title", "is-dark"];
const SRCS = ["a.png", "b.png", "c.png"];

type Spec =
  | { kind: "leaf"; tag: string; classes: string[]; text: string; src: string }
  | { kind: "box"; tag: string; classes: string[]; children: Spec[] };

const { tree } = fc.letrec<{ node: Spec; leaf: Spec; box: Spec; tree: Spec[] }>((tie) => ({
  node: fc.oneof({ depthSize: "small", withCrossShrink: true }, tie("leaf"), tie("box")),
  leaf: fc.record({
    kind: fc.constant("leaf" as const),
    tag: fc.constantFrom("p", "h2", "span", "a", "button", "img"),
    classes: fc.subarray(CLASSES, { maxLength: 2 }),
    text: fc.constantFrom(...TEXTS),
    src: fc.constantFrom(...SRCS),
  }),
  box: fc.record({
    kind: fc.constant("box" as const),
    tag: fc.constantFrom("div", "section", "ul", "li"),
    classes: fc.subarray(CLASSES, { maxLength: 2 }),
    children: fc.array(tie("node"), { maxLength: 4 }),
  }),
  tree: fc.array(tie("node"), { minLength: 1, maxLength: 5 }),
}));

function render(doc: Document, spec: Spec): Element {
  const el = doc.createElement(spec.tag);
  if (spec.classes.length) el.className = spec.classes.join(" ");
  if (spec.kind === "leaf") {
    if (spec.tag === "img") el.setAttribute("src", spec.src);
    else el.textContent = spec.text;
  } else for (const c of spec.children) el.appendChild(render(doc, c));
  return el;
}

type Op =
  | "insert"
  | "remove"
  | "wrap"
  | "addClass"
  | "removeClass"
  | "editText"
  | "move"
  | "clone"
  | "removeTarget"
  | "moveTarget"
  | "editTarget";

const BENIGN: Op[] = ["insert", "remove", "wrap", "addClass", "removeClass", "editText", "move"];
const ALL: Op[] = [...BENIGN, "clone", "removeTarget", "moveTarget", "editTarget"];

interface Mut {
  op: Op;
  a: number;
  b: number;
}

const mutation = (ops: Op[]) => fc.record({ op: fc.constantFrom(...ops), a: fc.nat(), b: fc.nat() });

let fresh = 0;

function correspondingIn(clone: Element, original: Element, target: Element): Element | null {
  const route: number[] = [];
  let cur: Element = target;
  while (cur !== original) {
    const parent = cur.parentElement!;
    route.unshift(Array.prototype.indexOf.call(parent.children, cur));
    cur = parent;
  }
  let out: Element | undefined = clone;
  for (const i of route) out = out?.children[i];
  return out ?? null;
}

function apply(doc: Document, target: Element, m: Mut, clones: Set<Element>) {
  const all = Array.from(doc.body.querySelectorAll("*"));
  if (all.length === 0) return;
  const pick = all[m.a % all.length]!;
  const containers = [doc.body, ...all.filter((e) => !["img", "p", "h2", "span", "a", "button"].includes(e.localName))];
  const touchesTarget = pick === target || pick.contains(target);

  switch (m.op) {
    case "insert": {
      const parent = containers[m.a % containers.length]!;
      const el = doc.createElement(m.b % 2 ? "div" : "p");
      el.className = `n-${fresh}`;
      el.textContent = `new content ${fresh++}`;
      parent.insertBefore(el, parent.children[m.b % (parent.children.length + 1)] ?? null);
      break;
    }
    case "remove":
      if (!touchesTarget) pick.remove();
      break;
    case "wrap": {
      const w = doc.createElement("div");
      w.className = "n-wrap";
      pick.before(w);
      w.append(pick);
      break;
    }
    case "addClass":
      if (pick !== target) pick.classList.add(CLASSES[m.b % CLASSES.length]!);
      break;
    case "removeClass":
      if (pick !== target && pick.classList.length) pick.classList.remove(pick.classList[0]!);
      break;
    case "editText":
      if (!touchesTarget && pick.children.length === 0 && pick.localName !== "img") pick.textContent = `edited ${fresh++}`;
      break;
    case "move": {
      const dest = containers[m.b % containers.length]!;
      if (dest !== pick && !pick.contains(dest)) dest.appendChild(pick);
      break;
    }
    case "clone": {
      const c = pick.cloneNode(true) as Element;
      pick.after(c);
      if (pick === target) clones.add(c);
      else if (pick.contains(target)) {
        const twin = correspondingIn(c, pick, target);
        if (twin) clones.add(twin);
      }
      break;
    }
    case "removeTarget":
      target.remove();
      break;
    case "moveTarget": {
      const dest = containers[m.b % containers.length]!;
      if (dest !== target && !target.contains(dest)) dest.appendChild(target);
      break;
    }
    case "editTarget":
      if (target.localName !== "img") target.append(doc.createTextNode(` edited ${fresh++}`));
      break;
  }
}

function scenario(spec: Spec[], targetPick: number, muts: Mut[]) {
  const doc = document.implementation.createHTMLDocument("");
  for (const s of spec) doc.body.appendChild(render(doc, s));
  const all = Array.from(doc.body.querySelectorAll("*"));
  const target = all[targetPick % all.length]!;
  const anchor = capture(target, undefined, new DocIndex(doc));
  const clones = new Set<Element>();
  for (const m of muts) apply(doc, target, m, clones);
  const index = new DocIndex(doc);
  const res = resolve(anchor, index);
  return { target, res, clones, anchor, index };
}

/** Same content, in exactly the commented element's structural slot (position + parent's children). */
function indistinguishable(el: Element, a: Anchor, idx: DocIndex): boolean {
  return idx.key(el) === a.key && idx.path(el) === a.path && idx.parentSig(el) === a.parentSig;
}

function isCorrect(res: Resolution, s: { target: Element; clones: Set<Element>; anchor: Anchor; index: DocIndex }): boolean {
  if (res.status !== "attached" || res.element === s.target) return true;
  if (s.index.key(res.element) !== s.anchor.key) return false;
  return indistinguishable(res.element, s.anchor, s.index) || s.clones.has(res.element);
}

describe("anchoring properties", () => {
  // Async properties yield between runs so the test worker stays responsive on long runs.
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));

  it("always attaches to the commented element on an unchanged page", async () => {
    await fc.assert(
      fc.asyncProperty(tree, fc.nat(), async (spec, pick) => {
        await tick();
        const { target, res } = scenario(spec, pick, []);
        expect(res.status).toBe("attached");
        expect(res.status === "attached" && res.element).toBe(target);
      }),
      { numRuns: 1000 },
    );
  }, 60_000);

  it("never attaches a comment to the wrong element, under any sequence of edits", async () => {
    await fc.assert(
      fc.asyncProperty(tree, fc.nat(), fc.array(mutation(ALL), { minLength: 1, maxLength: 6 }), async (spec, pick, muts) => {
        await tick();
        const s = scenario(spec, pick, muts);
        expect(isCorrect(s.res, s)).toBe(true);
      }),
      { numRuns: Number(process.env.ANCHOR_RUNS ?? 3000) },
    );
  }, 180_000);

  it("keeps most comments attached through ordinary edits elsewhere on the page", async () => {
    const samples = fc.sample(
      fc.tuple(tree, fc.nat(), fc.array(mutation(BENIGN), { minLength: 1, maxLength: 4 })),
      { numRuns: 2000, seed: 42 },
    );
    // Split by what was commented on: distinctive content (a heading, a paragraph, an image), a
    // repeated element (the third "Learn more"), or an empty box. The generator is deliberately
    // heavy on the last two; real comments are mostly on the first.
    const stats = {
      distinctive: { n: 0, attached: 0, found: 0 },
      repeated: { n: 0, attached: 0, found: 0 },
      empty: { n: 0, attached: 0, found: 0 },
    };
    for (const [i, [spec, pick, muts]] of samples.entries()) {
      if (i % 50 === 0) await tick();
      const { target, res, anchor } = scenario(spec, pick, muts);
      const isEmpty = anchor.text === "" && anchor.digest === "" && Object.keys(anchor.attrs).length === 0;
      const s = isEmpty ? stats.empty : anchor.unique ? stats.distinctive : stats.repeated;
      s.n++;
      if (res.status !== "detached" && res.element === target) {
        s.found++;
        if (res.status === "attached") s.attached++;
      }
    }
    const pct = (a: number, n: number) => `${((a / Math.max(1, n)) * 100).toFixed(1)}%`;
    for (const [name, s] of Object.entries(stats))
      console.info(`[anchor] ${name} content (n=${s.n}): ${pct(s.attached, s.n)} auto-attached, ${pct(s.found, s.n)} attached or correctly suggested`);
    // Regression floors, a little under the measured values.
    expect(stats.distinctive.attached / stats.distinctive.n).toBeGreaterThan(0.9);
    expect((stats.distinctive.found + stats.repeated.found + stats.empty.found) / samples.length).toBeGreaterThan(0.97);
  }, 120_000);
});
