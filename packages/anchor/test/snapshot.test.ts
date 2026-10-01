import { describe, expect, it } from "vitest";
import { breakpoint, diffSnapshot, type Snapshot } from "../src";

const base: Snapshot = {
  v: 1,
  viewportWidth: 1440,
  text: "Book a demo",
  src: null,
  size: { w: 160, h: 48 },
  styles: { "font-size": "16px", color: "rgb(0, 0, 0)" },
};

describe("diffSnapshot", () => {
  it("reports nothing for an identical element", () => {
    expect(diffSnapshot(base, structuredClone(base))).toEqual({ comparable: true, changes: [] });
  });

  it("reports style, text and size changes in plain terms", () => {
    const after: Snapshot = {
      ...base,
      text: "Book a call",
      size: { w: 200, h: 48 },
      styles: { "font-size": "20px", color: "rgb(0, 0, 0)" },
    };
    const { changes } = diffSnapshot(base, after);
    expect(changes).toContainEqual({ field: "text", from: "Book a demo", to: "Book a call" });
    expect(changes).toContainEqual({ field: "font-size", from: "16px", to: "20px" });
    expect(changes).toContainEqual({ field: "width", from: "160px", to: "200px" });
  });

  it("ignores sub-pixel size noise", () => {
    const after = { ...base, size: { w: 161, h: 47 } };
    expect(diffSnapshot(base, after).changes).toEqual([]);
  });

  it("does not compare styles across breakpoints", () => {
    const after = { ...base, viewportWidth: 375, styles: { "font-size": "14px", color: "rgb(0, 0, 0)" } };
    const d = diffSnapshot(base, after);
    expect(d.comparable).toBe(false);
    expect(d.changes).toEqual([]);
  });

  it("maps widths to Webflow breakpoints", () => {
    expect([1440, 991, 767, 479].map(breakpoint)).toEqual(["desktop", "tablet", "mobile-landscape", "mobile-portrait"]);
  });
});
