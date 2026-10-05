import { describe, expect, it } from "vitest";
import { duration, impact, stageTimes } from "./impact";

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

describe("stageTimes", () => {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 1, 0) + h * 3_600_000).toISOString();
  const status = (comment_id: string, h: number, from: string, to: string) => ({ comment_id, action: "comment.status", meta: { from, to }, created_at: at(h) });
  const client = (comment_id: string, h: number, ok: boolean) => ({ comment_id, action: ok ? "client.approved" : "client.rejected", meta: {}, created_at: at(h) });

  it("has no times before anything has moved", () => {
    const s = stageTimes([{ id: "a", created_at: at(0) }], []);
    expect(s).toEqual({ waitingToStart: { medianHours: null, count: 0 }, inProgress: { medianHours: null, count: 0 }, waitingForClient: { medianHours: null, count: 0 } });
  });

  it("measures each stage from the activity log", () => {
    const s = stageTimes(
      [{ id: "a", created_at: at(0) }],
      [status("a", 2, "open", "in_progress"), status("a", 10, "in_progress", "resolved"), client("a", 34, true)],
    );
    expect(s.waitingToStart).toEqual({ medianHours: 2, count: 1 });
    expect(s.inProgress).toEqual({ medianHours: 8, count: 1 });
    expect(s.waitingForClient).toEqual({ medianHours: 24, count: 1 });
  });

  it("counts a comment sent back by the client twice: each wait and each round of work", () => {
    const s = stageTimes(
      [{ id: "a", created_at: at(0) }],
      [
        status("a", 1, "open", "in_progress"),
        status("a", 3, "in_progress", "resolved"),
        status("a", 5, "resolved", "open"), // same instant as the answer, and listed before it
        client("a", 5, false),
        status("a", 6, "open", "in_progress"),
        status("a", 10, "in_progress", "resolved"),
        client("a", 16, true),
      ],
    );
    expect(s.waitingToStart).toEqual({ medianHours: 1, count: 1 });
    expect(s.inProgress).toEqual({ medianHours: 3, count: 2 }); // 2 h and 4 h
    expect(s.waitingForClient).toEqual({ medianHours: 4, count: 2 }); // 2 h and 6 h
  });

  it("does not count work time for a comment resolved straight from open, or a client wait that was reopened by the team", () => {
    const s = stageTimes(
      [{ id: "a", created_at: at(0) }, { id: "b", created_at: at(0) }],
      [status("a", 4, "open", "resolved"), status("b", 1, "open", "resolved"), status("b", 2, "resolved", "open"), client("b", 9, true)],
    );
    expect(s.inProgress.count).toBe(0);
    expect(s.waitingForClient.count).toBe(0);
    expect(s.waitingToStart).toEqual({ medianHours: 2.5, count: 2 });
  });

  it("uses the median, so one comment that sat for a month does not hide the rest", () => {
    const comments = ["a", "b", "c"].map((id) => ({ id, created_at: at(0) }));
    const s = stageTimes(comments, [status("a", 1, "open", "in_progress"), status("b", 2, "open", "in_progress"), status("c", 720, "open", "in_progress")]);
    expect(s.waitingToStart.medianHours).toBe(2);
  });
});
