import type { Item, Section } from "./ir";

/**
 * The studio's conventions as data: which measurement means which token or class. Changing how
 * Basenine builds means editing this table, not a prompt. Values follow Client-First naming and
 * the examples in the brief (1200px → container-large, 48px gap → spacing-xl).
 */
export interface Rules {
  containers: Record<number, string>;
  sectionPadding: Record<number, string>;
  headings: Record<number, string>;
  text: Record<number, string>;
  /** Gap in px → the Webflow variable that holds it. */
  spacing: Record<number, string>;
}

export const BASENINE_RULES: Rules = {
  containers: { 768: "container-small", 1024: "container-medium", 1200: "container-large" },
  sectionPadding: { 64: "padding-section-small", 96: "padding-section-medium", 128: "padding-section-large" },
  headings: { 56: "heading-style-h1", 40: "heading-style-h2", 32: "heading-style-h3", 24: "heading-style-h4" },
  text: { 20: "text-size-large", 18: "text-size-medium", 16: "text-size-regular", 14: "text-size-small" },
  spacing: { 16: "spacing--sm", 24: "spacing--md", 32: "spacing--lg", 48: "spacing--xl", 64: "spacing--2xl" },
};

/** What already exists in the destination Webflow site (read through Webflow's API before building). */
export interface Site {
  classes: string[];
  components: string[];
  /** Elements a previous build created: stable key → content hash. This is what makes builds idempotent. */
  built: Record<string, string>;
}

export type Op =
  | { op: "class"; name: string; styles: Record<string, string> }
  | { op: "element"; key: string; parent: string | null; tag: string; classes: string[]; text?: string; asset?: string; source: string }
  | { op: "component"; key: string; parent: string | null; component: string; props: Record<string, string>; source: string };

export interface BuildSpec {
  page: string;
  ops: Op[];
  reusedClasses: string[];
  reusedComponents: string[];
  /** Things a person must look at: untokenised values, utilities missing from the starter. */
  warnings: string[];
  /** Sections no rule could build, with the reason. They are skipped, never approximated. */
  manual: { section: string; reason: string }[];
}

/** Only sections at or above this confidence are built; the rest wait for a human's confirmation. */
export const BUILD_THRESHOLD = 0.8;

function token(table: Record<number, string>, px: number, what: string, warnings: string[]): string | null {
  const sizes = Object.keys(table).map(Number);
  if (sizes.length === 0 || px <= 0) return null;
  const nearest = sizes.reduce((a, b) => (Math.abs(b - px) < Math.abs(a - px) ? b : a));
  // Off-scale values are snapped to the system, and reported: the design or the token table is wrong.
  if (Math.abs(nearest - px) > 1) warnings.push(`${what}: ${px}px is not a token; used ${table[nearest]} (${nearest}px)`);
  return table[nearest]!;
}

export function compile(page: string, sections: Section[], site: Site, rules: Rules = BASENINE_RULES, approved: ReadonlySet<string> = new Set()): BuildSpec {
  const ops: Op[] = [];
  const warnings: string[] = [];
  const manual: BuildSpec["manual"] = [];
  const have = new Set(site.classes);
  const components = new Set(site.components);
  const usedExisting = new Set<string>();
  const usedComponents = new Set<string>();
  const declared = new Set<string>();

  /** Reuse before creation: a class is created only if neither the site nor this build has it. */
  const cls = (name: string, styles: Record<string, string> = {}): string => {
    if (have.has(name)) usedExisting.add(name);
    else if (!declared.has(name)) {
      declared.add(name);
      ops.push({ op: "class", name, styles });
    }
    return name;
  };
  /** Utilities come from the starter. A missing one is a starter problem, not something to invent here. */
  const utility = (name: string): string => {
    if (have.has(name)) usedExisting.add(name);
    else if (!warnings.includes(`Starter is missing the utility class "${name}"`)) warnings.push(`Starter is missing the utility class "${name}"`);
    return name;
  };
  const el = (key: string, parent: string | null, tag: string, classes: string[], source: string, extra: { text?: string; asset?: string } = {}) => {
    ops.push({ op: "element", key, parent, tag, classes, source, ...extra });
    return key;
  };

  for (const s of sections) {
    if (!s.pattern) {
      manual.push({ section: s.name, reason: s.flags[0] ?? "No matching pattern" });
      continue;
    }
    if (s.confidence < BUILD_THRESHOLD && !approved.has(s.node)) {
      manual.push({ section: s.name, reason: `Needs confirmation (${Math.round(s.confidence * 100)}% sure it is a ${s.pattern})` });
      continue;
    }
    const base = `${page}_${s.pattern}`;
    const k = (part: string) => `${s.node}/${part}`;

    // Site-wide chrome is a component in the starter: place it, never rebuild it.
    if (s.pattern === "navbar" || s.pattern === "footer") {
      const name = s.pattern === "navbar" ? "Navbar" : "Footer";
      if (components.has(name)) {
        usedComponents.add(name);
        ops.push({ op: "component", key: k("component"), parent: null, component: name, props: {}, source: s.node });
      } else manual.push({ section: s.name, reason: `Starter has no ${name} component` });
      continue;
    }

    const section = el(k("section"), null, "section", [cls(`section_${base}`), ...(s.theme === "dark" ? [utility("is-dark")] : [])], s.node);
    const padding = el(k("padding"), section, "div", [utility("padding-global")], s.node);
    const container = el(k("container"), padding, "div", [utility(token(rules.containers, s.containerWidth, `${s.name} container`, warnings) ?? "container-large")], s.node);
    const pad = token(rules.sectionPadding, s.paddingY, `${s.name} section padding`, warnings);
    const inner = pad ? el(k("spacing"), container, "div", [utility(pad)], s.node) : container;
    const gap = token(rules.spacing, s.layout.gap, `${s.name} gap`, warnings);
    const gapValue = gap ? `var(--${gap})` : "0px";

    const layoutStyles: Record<string, string> =
      s.layout.type === "split"
        ? { display: "grid", "grid-template-columns": "1fr 1fr", gap: gapValue, "align-items": "center" }
        : s.layout.type === "stack"
          ? { display: "flex", "flex-direction": "column", gap: gapValue }
          : {};
    const component = el(k("component"), inner, "div", [cls(`${base}_component`, layoutStyles)], s.node);

    const media = s.items.filter((i) => i.role === "media");
    const cards = s.items.filter((i) => i.role === "card");
    const copy = s.items.filter((i) => i.role !== "media" && i.role !== "card");
    const split = s.layout.type === "split";
    const content = split ? el(k("content"), component, "div", [cls(`${base}_content`)], s.node) : component;

    const emit = (items: Item[], parent: string, level: "h1" | "h2" | "h3") => {
      let group: string | null = null;
      for (const i of items) {
        if (i.role === "button") {
          group ??= el(`${i.node}/group`, parent, "div", [utility("button-group")], i.node);
          if (components.has("Button")) {
            usedComponents.add("Button");
            ops.push({ op: "component", key: i.node, parent: group, component: "Button", props: { text: i.text, variant: i.variant }, source: i.node });
          } else el(i.node, group, "a", [utility("button"), ...(i.variant === "secondary" ? [utility("is-secondary")] : [])], i.node, { text: i.text });
        } else if (i.role === "heading") el(i.node, parent, level, [utility(token(rules.headings, i.fontSize, `"${i.text.slice(0, 30)}" heading`, warnings) ?? "heading-style-h2")], i.node, { text: i.text });
        else if (i.role === "eyebrow") el(i.node, parent, "div", [utility("text-style-allcaps")], i.node, { text: i.text });
        else if (i.role === "text") el(i.node, parent, "p", [utility(token(rules.text, i.fontSize, `"${i.text.slice(0, 30)}" text`, warnings) ?? "text-size-regular")], i.node, { text: i.text });
        else if (i.role === "media") el(i.node, parent, "img", [cls(`${base}_image`)], i.node, { asset: i.imageRef ?? undefined });
      }
    };

    emit(copy, content, s.pattern === "hero" ? "h1" : "h2");

    if (cards.length) {
      const list = el(k("list"), component, "div", [cls(`${base}_list`, { display: "grid", "grid-template-columns": `repeat(${cards.length}, 1fr)`, gap: gapValue })], s.node);
      for (const c of cards) if (c.role === "card") emit(c.items, el(c.node, list, "div", [cls(`${base}_card`)], c.node), "h3");
    }
    if (media.length) {
      const visual = split ? el(k("visual"), component, "div", [cls(`${base}_visual`)], s.node) : s.pattern === "logos" ? el(k("list"), component, "div", [cls(`${base}_list`, { display: "flex", "flex-wrap": "wrap", gap: gapValue, "align-items": "center" })], s.node) : component;
      emit(media, visual, "h2");
    }
  }

  return { page, ops, reusedClasses: [...usedExisting].sort(), reusedComponents: [...usedComponents].sort(), warnings, manual };
}
