import { describe, expect, it } from "vitest";
import { duration, impact } from "./impact";

type Row = Parameters<typeof impact>[0][number];
const anchor = { selector: "h1" } as Row["anchor"];
const base: Row = {
  anchor,
  context: { viewport: { w: 1440, h: 900 }, browser: "Chrome 153" },
  triage: null,
  change_summary: null,
  anchor_state: "attached",
  client_review: null,
  status: "open",
  created_at: "2026-10-01T10:00:00Z",
  resolved_at: null,
};
const triage = (over: object) => ({ title: "t", category: "copy", priority: "medium", task: "x", needsClarification: false, clarificationQuestion: null, duplicateOf: null, confidence: 1, change: null, scope: "tweak", reason: null, ...over }) as Row["triage"];

describe("impact", () => {
  it("is all zeros for an empty project", () => {
    const i = impact([]);
    expect([i.total, i.withContext, i.labelled, i.fixesSpotted, i.resolved, i.medianHoursToResolve]).toEqual([0, 0, 0, 0, 0, null]);
  });

  it("counts only what actually happened", () => {
    const i = impact([
      base,
      { ...base, anchor: null, context: {} }, // a pin on a design image: no element context
      { ...base, triage: triage({ needsClarification: true }) },
      { ...base, triage: triage({ duplicateOf: 2 }) },
      { ...base, triage: triage({ scope: "new_work", reason: "needs a new section" }) },
      { ...base, triage: triage({ priority: "urgent", reason: "checkout is broken" }) },
      { ...base, triage: triage({ change: { from: "a", to: "b" } }) },
      { ...base, change_summary: { comparable: true, changes: [{ field: "font-size", from: "56px", to: "48px" }] } },
      { ...base, change_summary: { comparable: true, changes: [] } },
      { ...base, anchor_state: "detached" },
      { ...base, anchor_state: "suggested" },
      { ...base, status: "resolved", resolved_at: "2026-10-01T12:00:00Z", client_review: "approved" },
      { ...base, status: "resolved", resolved_at: "2026-10-01T20:00:00Z", client_review: "pending" },
      { ...base, client_review: "rejected" },
    ]);
    expect(i.total).toBe(14);
    expect(i.withContext).toBe(13);
    expect(i.labelled).toBe(5);
    expect(i.flags).toEqual({ vague: 1, duplicate: 1, priority: 1, newWork: 1, copy: 1 });
    expect(i.fixesSpotted).toBe(1);
    expect(i.pins).toEqual({ onElement: 11, flagged: 2 });
    expect(i.signOff).toEqual({ asked: 3, confirmed: 1, sentBack: 1, waiting: 1 });
    expect(i.resolved).toBe(2);
    expect(i.medianHoursToResolve).toBe(6); // median of 2 h and 10 h
  });

  it("formats durations for people", () => {
    expect([duration(0.25), duration(5.4), duration(72)]).toEqual(["15 min", "5 h", "3 days"]);
  });
});
