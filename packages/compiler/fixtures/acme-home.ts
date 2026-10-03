import type { FigmaNode, FigmaPaint } from "../src/figma";

// A homepage in the shape the Figma REST API returns it (GET /v1/files/:key/nodes), authored to
// the proposed Basenine spec: sections named section/<pattern>, Auto Layout, component instances
// for buttons and site chrome. Two layers deliberately break the spec, the way real files do: an
// interactive demo no rule covers, and an unnamed "Frame 4127".

let n = 100;
const id = () => `12:${n++}`;
const white: FigmaPaint = { type: "SOLID", color: { r: 1, g: 1, b: 1 } };
const ink: FigmaPaint = { type: "SOLID", color: { r: 0.04, g: 0.04, b: 0.06 } };
const image = (ref: string): FigmaPaint => ({ type: "IMAGE", imageRef: ref });

const text = (name: string, characters: string, fontSize: number): FigmaNode => ({
  id: id(),
  name,
  type: "TEXT",
  characters,
  style: { fontSize, fontWeight: fontSize >= 24 ? 600 : 400 },
});
const button = (variant: "Primary" | "Secondary", label: string): FigmaNode => ({
  id: id(),
  name: `button/${variant.toLowerCase()}`,
  type: "INSTANCE",
  componentName: `Button/${variant}`,
  children: [text("label", label, 16)],
});
const frame = (name: string, layoutMode: FigmaNode["layoutMode"], itemSpacing: number, kids: FigmaNode[], extra: Partial<FigmaNode> = {}): FigmaNode => ({
  id: id(),
  name,
  type: "FRAME",
  layoutMode,
  itemSpacing,
  children: kids,
  ...extra,
});
const box = (width: number) => ({ absoluteBoundingBox: { x: 0, y: 0, width, height: 0 } });
const section = (name: string, paddingTop: number, fill: FigmaPaint, container: FigmaNode): FigmaNode => ({
  id: id(),
  name,
  type: "FRAME",
  layoutMode: "VERTICAL",
  paddingTop,
  paddingBottom: paddingTop,
  fills: [fill],
  children: [container],
  ...box(1440),
});

const FEATURES: [string, string][] = [
  ["Live tracking", "GPS positions refresh every five seconds."],
  ["Smart dispatch", "Assign loads to the nearest available driver."],
  ["Proof of delivery", "Photos and signatures on every stop."],
];

export function acmeHome(heroHeading = "Every truck, every route, one live map."): FigmaNode {
  n = 100; // same ids on every call, as a real file would have
  return {
    id: "12:1",
    name: "Home / Desktop",
    type: "FRAME",
    children: [
      { id: id(), name: "section/navbar", type: "INSTANCE", componentName: "Navbar" },
      section(
        "section/hero",
        128,
        white,
        frame(
          "container",
          "VERTICAL",
          0,
          [
            frame("hero", "HORIZONTAL", 48, [
              frame("content", "VERTICAL", 24, [
                text("eyebrow", "Fleet visibility", 14),
                text("heading", heroHeading, 56),
                text("text", "Acme gives logistics teams real-time visibility across their fleet.", 20),
                frame("buttons", "HORIZONTAL", 16, [button("Primary", "Book a demo"), button("Secondary", "See how it works")]),
              ]),
              { id: id(), name: "media", type: "RECTANGLE", fills: [image("img_hero_map")] },
            ]),
          ],
          box(1200),
        ),
      ),
      section(
        "section/logos",
        64,
        white,
        frame(
          "container",
          "VERTICAL",
          0,
          [
            frame(
              "row",
              "HORIZONTAL",
              48,
              ["northwind", "contoso", "initech", "globex", "umbrella"].map((l): FigmaNode => ({ id: id(), name: "logo", type: "RECTANGLE", fills: [image(`img_logo_${l}`)] })),
            ),
          ],
          box(1200),
        ),
      ),
      section(
        "section/features",
        96,
        white,
        frame(
          "container",
          "VERTICAL",
          48,
          [
            text("heading", "Built for the people who keep freight moving", 40),
            // 30px is off the spacing scale on purpose: the build snaps it and says so.
            frame(
              "list",
              "HORIZONTAL",
              30,
              FEATURES.map(([h, p]) => frame("card", "VERTICAL", 16, [text("heading", h, 24), text("text", p, 16)])),
            ),
          ],
          box(1200),
        ),
      ),
      section("section/product-demo", 96, white, frame("container", "NONE", 0, [text("Text 88", "Interactive product demo", 32)], box(1200))),
      // Unnamed and unstructured, as it came out of a rushed design round.
      {
        id: id(),
        name: "Frame 4127",
        type: "FRAME",
        fills: [ink],
        paddingTop: 96,
        ...box(1440),
        children: [
          frame(
            "Frame 4128",
            "VERTICAL",
            24,
            [text("Text 12", "Trusted by 400 fleets", 40), text("Text 13", "From regional carriers to national networks.", 18), button("Primary", "Read the stories")],
            box(768),
          ),
        ],
      },
      section(
        "section/cta",
        128,
        ink,
        frame(
          "container",
          "VERTICAL",
          24,
          [
            text("heading", "See your whole fleet in ten minutes", 40),
            text("text", "No hardware to install. Connect your telematics and go.", 18),
            frame("buttons", "HORIZONTAL", 16, [button("Primary", "Book a demo")]),
          ],
          box(768),
        ),
      ),
      { id: id(), name: "section/footer", type: "INSTANCE", componentName: "Footer" },
    ],
  };
}

/** The Basenine Webflow Starter as the build would read it from the site before creating anything. */
export const starter = () => ({
  classes: [
    "padding-global",
    "container-small",
    "container-medium",
    "container-large",
    "padding-section-small",
    "padding-section-medium",
    "padding-section-large",
    "heading-style-h1",
    "heading-style-h2",
    "heading-style-h3",
    "heading-style-h4",
    "text-size-large",
    "text-size-medium",
    "text-size-regular",
    "text-size-small",
    "text-style-allcaps",
    "button",
    "button-group",
    "is-secondary",
    "is-dark",
  ],
  components: ["Navbar", "Footer", "Button"],
  built: {} as Record<string, string>,
});
