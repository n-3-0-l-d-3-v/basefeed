import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { acmeHome, starter } from "../fixtures/acme-home";
import { analysis, apply, compile, interpretPage, plan, validate, type FigmaNode, type Op } from "../src";

const build = (page: FigmaNode = acmeHome(), site = starter(), approved?: ReadonlySet<string>) => {
  const sections = interpretPage(page);
  return { sections, spec: compile("home", sections, site, undefined, approved) };
};
const classOps = (ops: Op[]) => ops.flatMap((o) => (o.op === "class" ? [o.name] : []));

describe("interpretation", () => {
  it("maps each section to a pattern, and says how sure it is", () => {
    expect(analysis(build().sections).split("\n")).toEqual([
      "✓ navbar → existing component · 100%",
      "✓ hero → hero (split) · 100%",
      "✓ logos → logos (stack) · 100%",
      "✓ features → features (3-column grid) · 100%",
      '? product-demo → custom/manual (No build rule for "product-demo" yet: manual implementation)',
      "? Frame 4127 → cta (stack, dark) · 60% · inferred, please confirm",
      "✓ cta → cta (stack, dark) · 100%",
      "✓ footer → existing component · 100%",
    ]);
  });

  it("never builds what it is unsure of or has no rule for, until a person approves it", () => {
    const { sections, spec } = build();
    expect(spec.manual.map((m) => m.section)).toEqual(["section/product-demo", "Frame 4127"]);
    const guessed = sections.find((s) => s.name === "Frame 4127")!;
    expect(spec.ops.some((o) => o.op !== "class" && o.source === guessed.node)).toBe(false);

    const approved = build(acmeHome(), starter(), new Set([guessed.node])).spec;
    expect(approved.manual.map((m) => m.section)).toEqual(["section/product-demo"]);
    expect(approved.ops.some((o) => o.op !== "class" && o.source === guessed.node)).toBe(true);
  });
});

describe("rules engine", () => {
  it("produces the structure a Client-First developer would write by hand", () => {
    const { sections, spec } = build();
    const node = sections.find((s) => s.pattern === "hero")!.node;
    const hero = spec.ops.flatMap((o) => (o.op === "element" && o.source === node ? [`${o.tag}.${o.classes.join(".")}`] : []));
    expect(hero.slice(0, 6)).toEqual([
      "section.section_home_hero",
      "div.padding-global",
      "div.container-large",
      "div.padding-section-large",
      "div.home_hero_component",
      "div.home_hero_content",
    ]);
  });

  it("reuses before it creates: starter utilities and components are never recreated", () => {
    const { spec } = build();
    const created = classOps(spec.ops);
    expect(created.filter((c) => starter().classes.includes(c))).toEqual([]);
    expect(created.every((c) => /^(section_)?home_/.test(c))).toBe(true); // only this page's own classes
    expect(spec.reusedComponents).toEqual(["Button", "Footer", "Navbar"]);
    expect(spec.ops.some((o) => o.op === "element" && o.classes.includes("button"))).toBe(false); // the Button component, not a new link
  });

  it("snaps off-scale values to a token and reports them instead of inventing a new one", () => {
    expect(build().spec.warnings).toEqual(["section/features gap: 30px is not a token; used spacing--lg (32px)"]);
  });

  it("reports a starter that lacks a utility rather than creating it", () => {
    const site = { ...starter(), classes: starter().classes.filter((c) => c !== "padding-global") };
    const { spec } = build(acmeHome(), site);
    expect(spec.warnings).toContain('Starter is missing the utility class "padding-global"');
    expect(classOps(spec.ops)).not.toContain("padding-global");
  });

  it("passes its own validator", () => {
    expect(validate(build().spec)).toEqual([]);
  });

  it("the validator rejects generated-looking names, duplicates and dangling elements", () => {
    const { spec } = build();
    const broken = {
      ...spec,
      ops: [
        ...spec.ops,
        { op: "class", name: "section_home_hero", styles: {} },
        { op: "element", key: "x", parent: "nowhere", tag: "div", classes: ["div-274", "container-copy-2", "Frame Wrapper"], source: "x" },
      ] satisfies Op[],
    };
    expect(validate(broken)).toEqual([
      'Class "section_home_hero" would be created twice',
      "x is attached to nowhere, which does not exist yet",
      '"div-274" is a generated-looking class name',
      '"container-copy-2" is a generated-looking class name',
      '"Frame Wrapper" does not follow the naming rules',
    ]);
  });
});

describe("idempotency and deltas", () => {
  it("running the same build twice changes nothing the second time", () => {
    const { spec } = build();
    const first = plan(spec, starter());
    expect(first.create.length).toBeGreaterThan(40);
    const after = apply(spec, starter());
    const second = plan(build(acmeHome(), after).spec, after);
    expect([second.createClasses, second.create, second.update, second.orphaned]).toEqual([[], [], [], []]);
  });

  it("a changed heading in Figma is one update, not a rebuild", () => {
    const after = apply(build().spec, starter());
    const next = plan(build(acmeHome("One live map for every truck."), after).spec, after);
    expect([next.create.length, next.update.length, next.createClasses.length]).toEqual([0, 1, 0]);
  });

  it("a section removed from the design is reported, not silently deleted", () => {
    const after = apply(build().spec, starter());
    const page = acmeHome();
    const trimmed = { ...page, children: page.children!.filter((c) => c.name !== "section/logos") };
    const next = plan(build(trimmed, after).spec, after);
    expect(next.create).toEqual([]);
    expect(next.orphaned.length).toBeGreaterThan(5);
  });

  it("is deterministic: the same design and site always give the same build", () => {
    expect(build().spec).toEqual(build().spec);
  });
});

describe("any page made of supported patterns", () => {
  // Random pages: any order and number of sections, any font sizes and gaps (on or off the scale).
  const px = fc.integer({ min: 8, max: 140 });
  const page = fc.array(fc.tuple(fc.constantFrom("hero", "logos", "features", "cta"), px, px, fc.integer({ min: 2, max: 4 })), { minLength: 1, maxLength: 6 }).map((specs): FigmaNode => {
    let n = 0;
    const id = () => `9:${n++}`;
    const text = (name: string, size: number): FigmaNode => ({ id: id(), name, type: "TEXT", characters: `${name} ${n}`, style: { fontSize: size } });
    return {
      id: "9:page",
      name: "Page",
      type: "FRAME",
      children: specs.map(([pattern, size, gap, cards]) => ({
        id: id(),
        name: `section/${pattern}`,
        type: "FRAME" as const,
        paddingTop: gap,
        absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 0 },
        children: [
          {
            id: id(),
            name: "container",
            type: "FRAME" as const,
            layoutMode: "VERTICAL" as const,
            itemSpacing: gap,
            absoluteBoundingBox: { x: 0, y: 0, width: 900 + size * 3, height: 0 },
            children: [
              text("heading", size),
              text("text", Math.max(8, size - 20)),
              ...(pattern === "features" ? Array.from({ length: cards }, () => ({ id: id(), name: "card", type: "FRAME" as const, children: [text("heading", 24), text("text", 16)] })) : []),
              ...(pattern === "hero" ? [{ id: id(), name: "media", type: "RECTANGLE" as const, fills: [{ type: "IMAGE" as const, imageRef: "x" }] }] : []),
              { id: id(), name: "button/primary", type: "INSTANCE" as const, componentName: "Button/Primary", children: [text("label", 16)] },
            ],
          },
        ],
      })),
    };
  });

  it("builds a valid spec, creates no utility, and is idempotent", () => {
    fc.assert(
      fc.property(page, (p) => {
        const { spec } = build(p);
        expect(validate(spec)).toEqual([]);
        expect(classOps(spec.ops).filter((c) => starter().classes.includes(c))).toEqual([]);
        const after = apply(spec, starter());
        const again = plan(build(p, after).spec, after);
        expect([again.createClasses, again.create, again.update]).toEqual([[], [], []]);
      }),
      { numRuns: 300 },
    );
  });
});
