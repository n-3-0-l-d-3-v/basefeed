/**
 * The part of a Figma REST API node (`GET /v1/files/:key/nodes`) this compiler reads. Field names
 * and units are Figma's own, so a real API response can be passed in unchanged; anything not listed
 * here is ignored.
 */
export interface FigmaNode {
  id: string;
  name: string;
  type: "FRAME" | "GROUP" | "TEXT" | "RECTANGLE" | "VECTOR" | "INSTANCE" | "COMPONENT" | "ELLIPSE" | "LINE";
  children?: FigmaNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  /** Auto Layout. Absent or "NONE" means children are positioned by hand. */
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  itemSpacing?: number;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  fills?: FigmaPaint[];
  /** TEXT nodes. */
  characters?: string;
  style?: { fontSize?: number; fontWeight?: number; lineHeightPx?: number };
  /** INSTANCE nodes: the main component's name, resolved from the response's `components` map. */
  componentName?: string;
}

export type FigmaPaint =
  | { type: "SOLID"; color: { r: number; g: number; b: number; a?: number }; visible?: boolean }
  | { type: "IMAGE"; imageRef: string; visible?: boolean };

export const children = (n: FigmaNode): FigmaNode[] => n.children ?? [];

export function solidFill(n: FigmaNode): { r: number; g: number; b: number } | null {
  const paint = (n.fills ?? []).find((f) => f.type === "SOLID" && f.visible !== false);
  return paint && paint.type === "SOLID" ? paint.color : null;
}

export function imageRef(n: FigmaNode): string | null {
  const paint = (n.fills ?? []).find((f) => f.type === "IMAGE" && f.visible !== false);
  return paint && paint.type === "IMAGE" ? paint.imageRef : null;
}

/** Perceived lightness, 0 (black) to 1 (white); used only to tell dark sections from light ones. */
export function luminance(c: { r: number; g: number; b: number }): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** Every node below `root`, depth first, in layer order. */
export function descendants(root: FigmaNode): FigmaNode[] {
  const out: FigmaNode[] = [];
  const walk = (n: FigmaNode) => {
    for (const c of children(n)) {
      out.push(c);
      walk(c);
    }
  };
  walk(root);
  return out;
}
