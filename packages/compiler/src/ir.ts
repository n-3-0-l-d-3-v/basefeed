import { children, imageRef, luminance, solidFill, type FigmaNode } from "./figma";

/**
 * The intermediate representation: what a section *is*, not how Figma happened to layer it.
 * Measurements stay in Figma's pixels here; turning them into tokens and classes is the rules
 * engine's job, so interpretation (judgement) and execution (rules) never mix.
 */
export const PATTERNS = ["navbar", "hero", "logos", "features", "cta", "footer"] as const;
export type Pattern = (typeof PATTERNS)[number];

export type Item =
  | { role: "eyebrow" | "heading" | "text"; node: string; text: string; fontSize: number }
  | { role: "button"; node: string; text: string; variant: "primary" | "secondary" }
  | { role: "media"; node: string; imageRef: string | null; alt: string }
  | { role: "card"; node: string; items: Item[] };

export interface Section {
  node: string;
  name: string;
  /** null = no rule can build this; it is listed for manual implementation, never guessed. */
  pattern: Pattern | null;
  theme: "light" | "dark";
  containerWidth: number;
  paddingY: number;
  layout: { type: "stack" | "split" | "grid"; columns: number; gap: number };
  items: Item[];
  /** 1 = named by the authoring spec. Lower = inferred, and worth a human look before building. */
  confidence: number;
  how: "named" | "inferred" | "unsupported";
  flags: string[];
}

/**
 * Where judgement plugs in. The default below is plain heuristics; an AI provider implements the
 * same interface to classify sections whose layers are unnamed or messy. Either way the answer is
 * only a pattern and a confidence: it cannot emit classes or elements.
 */
export interface Classifier {
  classify(summary: { headings: number; texts: number; buttons: number; media: number; cards: number }): { pattern: Pattern | null; confidence: number };
}

export const heuristicClassifier: Classifier = {
  classify(s) {
    if (s.cards >= 2) return { pattern: "features", confidence: 0.7 };
    if (s.headings >= 1 && s.buttons >= 1 && s.media >= 1) return { pattern: "hero", confidence: 0.65 };
    if (s.headings >= 1 && s.buttons >= 1 && s.media === 0) return { pattern: "cta", confidence: 0.6 };
    if (s.media >= 3 && s.headings === 0) return { pattern: "logos", confidence: 0.6 };
    return { pattern: null, confidence: 0.3 };
  },
};

const lastPart = (name: string) => name.toLowerCase().split("/").pop()!.trim();

function textOf(n: FigmaNode): string {
  if (n.type === "TEXT") return (n.characters ?? "").trim();
  for (const c of children(n)) {
    const t = textOf(c);
    if (t) return t;
  }
  return "";
}

function isButton(n: FigmaNode): boolean {
  const name = n.name.toLowerCase();
  return name.startsWith("button") || (n.type === "INSTANCE" && (n.componentName ?? "").toLowerCase().startsWith("button"));
}

/** Leaves of a section in layer order, grouped into cards where the designer grouped them. */
function collect(n: FigmaNode, largest: number): Item[] {
  const role = lastPart(n.name);
  if (isButton(n)) {
    const variant = /secondary|ghost|outline/.test(`${n.name} ${n.componentName ?? ""}`.toLowerCase()) ? "secondary" : "primary";
    return [{ role: "button", node: n.id, text: textOf(n), variant }];
  }
  if (role === "card") return [{ role: "card", node: n.id, items: children(n).flatMap((c) => collect(c, largest)) }];
  if (imageRef(n) || role === "media" || role === "logo") return [{ role: "media", node: n.id, imageRef: imageRef(n), alt: role === "media" || role === "logo" ? "" : n.name }];
  if (n.type === "TEXT") {
    const fontSize = n.style?.fontSize ?? 16;
    const named = role === "eyebrow" || role === "heading" || role === "text" ? role : null;
    // Unnamed text: the largest in the section is its heading, the rest is body copy.
    return [{ role: named ?? (fontSize >= largest && fontSize >= 24 ? "heading" : "text"), node: n.id, text: (n.characters ?? "").trim(), fontSize }];
  }
  return children(n).flatMap((c) => collect(c, largest));
}

function largestFont(n: FigmaNode): number {
  return Math.max(n.type === "TEXT" ? (n.style?.fontSize ?? 16) : 0, ...children(n).map(largestFont));
}

const count = (items: Item[], role: Item["role"]): number =>
  items.reduce((n, i) => n + (i.role === role ? 1 : 0) + (i.role === "card" ? count(i.items, role) : 0), 0);

/** The frame that lays out the section's main parts: the first with Auto Layout and 2+ children. */
function layoutFrame(n: FigmaNode): FigmaNode | null {
  for (const c of children(n)) {
    if (c.type !== "FRAME" && c.type !== "GROUP") continue;
    if (c.layoutMode && c.layoutMode !== "NONE" && children(c).length >= 2) return c;
    const deeper = layoutFrame(c);
    if (deeper) return deeper;
  }
  return null;
}

/** The frame whose direct children are the cards: its spacing is the grid's gap. */
function cardParent(n: FigmaNode): FigmaNode | null {
  if (children(n).filter((c) => lastPart(c.name) === "card").length >= 2) return n;
  for (const c of children(n)) {
    const found = cardParent(c);
    if (found) return found;
  }
  return null;
}

export function interpretSection(node: FigmaNode, classifier: Classifier = heuristicClassifier): Section {
  const flags: string[] = [];
  const items = collect(node, largestFont(node));
  const summary = {
    headings: count(items, "heading"),
    texts: count(items, "text"),
    buttons: count(items, "button"),
    media: count(items, "media"),
    cards: count(items, "card"),
  };

  const named = /^section\/([a-z-]+)/.exec(node.name.toLowerCase())?.[1];
  let pattern: Pattern | null;
  let confidence: number;
  let how: Section["how"];
  if (named && (PATTERNS as readonly string[]).includes(named)) [pattern, confidence, how] = [named as Pattern, 1, "named"];
  else if (named) {
    [pattern, confidence, how] = [null, 1, "unsupported"];
    flags.push(`No build rule for "${named}" yet: manual implementation`);
  } else {
    ({ pattern, confidence } = classifier.classify(summary));
    how = "inferred";
    flags.push(pattern ? `Layer is not named section/…: guessed ${pattern}` : "Could not tell what this section is: manual implementation");
  }

  const container = children(node).find((c) => c.type === "FRAME") ?? node;
  const frame = layoutFrame(node);
  const cards = summary.cards;
  const layout: Section["layout"] =
    cards >= 2
      ? { type: "grid", columns: cards, gap: cardParent(node)?.itemSpacing ?? frame?.itemSpacing ?? 0 }
      : frame?.layoutMode === "HORIZONTAL" && summary.media >= 1 && summary.headings >= 1
        ? { type: "split", columns: 2, gap: frame.itemSpacing ?? 0 }
        : { type: "stack", columns: 1, gap: frame?.itemSpacing ?? 0 };

  // Hand-positioned layers carry no layout intent, so nothing responsive can be derived from them.
  if (pattern && !frame && items.length > 1) {
    flags.push("No Auto Layout: spacing and order are taken from layer order only");
    confidence = Math.min(confidence, 0.5);
  }

  const fill = solidFill(node);
  return {
    node: node.id,
    name: node.name,
    pattern,
    theme: fill && luminance(fill) < 0.4 ? "dark" : "light",
    containerWidth: Math.round(container.absoluteBoundingBox?.width ?? node.absoluteBoundingBox?.width ?? 0),
    paddingY: node.paddingTop ?? 0,
    layout,
    items,
    confidence,
    how,
    flags,
  };
}

/** A page frame's top-level layers are its sections, in order. */
export function interpretPage(page: FigmaNode, classifier?: Classifier): Section[] {
  return children(page).map((n) => interpretSection(n, classifier));
}
