import { describe, expect, it } from "vitest";
import { triageInsights } from "./insights";
import { finalize } from "./prompt";
import type { TriageInput } from "./types";

const input: TriageInput = {
  comment: { number: 5, body: "Make it say Book a demo", priority: "medium", authorKind: "client" },
  element: { selector: "a.button", tag: "a", classes: ["button"], excerpt: "Start free trial" },
  page: { url: "https://acme.test/", title: "Home", breakpoint: "desktop", viewportWidth: 1440, device: "desktop" },
  openComments: [
    { number: 2, summary: "CTA should say Book a demo" },
    { number: 9, summary: "Same again" },
  ],
  screenshot: null,
};

const model = {
  title: "Update button copy",
  category: "copy" as const,
  priority: "medium" as const,
  task: "Change the .button text.",
  needsClarification: false,
  clarificationQuestion: null,
  duplicateOf: null,
  confidence: 0.9,
  change: null,
  scope: "tweak" as const,
  reason: null,
};

describe("finalize", () => {
  it("accepts a duplicate only of an existing, older comment", () => {
    expect(finalize({ ...model, duplicateOf: 2 }, input).duplicateOf).toBe(2);
    expect(finalize({ ...model, duplicateOf: 9 }, input).duplicateOf).toBeNull(); // newer than this one
    expect(finalize({ ...model, duplicateOf: 3 }, input).duplicateOf).toBeNull(); // not an open comment
  });

  it("drops a text change that changes nothing", () => {
    expect(finalize({ ...model, change: { from: "Start free trial", to: "Book a demo" } }, input).change).toEqual({ from: "Start free trial", to: "Book a demo" });
    expect(finalize({ ...model, change: { from: "Book a demo", to: " Book a demo " } }, input).change).toBeNull();
    expect(finalize({ ...model, change: { from: "x", to: "  " } }, input).change).toBeNull();
  });

  it("keeps a clarifying question only when clarification is needed", () => {
    expect(finalize({ ...model, clarificationQuestion: "Which part?" }, input).clarificationQuestion).toBeNull();
  });
});

describe("triageInsights", () => {
  const t = finalize(model, input);
  it("stays silent for a clear comment", () => {
    expect(triageInsights(t, "medium")).toEqual([]);
  });

  it("surfaces exactly what a person has to decide", () => {
    const flagged = { ...t, needsClarification: true, clarificationQuestion: "Which part?", duplicateOf: 2, priority: "urgent" as const, scope: "new_work" as const, reason: "Checkout is broken" };
    expect(triageInsights(flagged, "low").map((i) => i.kind)).toEqual(["clarify", "duplicate", "priority", "scope"]);
  });

  it("reads triage stored before the newer fields existed", () => {
    expect(triageInsights(null, "medium")).toEqual([]);
  });
});
