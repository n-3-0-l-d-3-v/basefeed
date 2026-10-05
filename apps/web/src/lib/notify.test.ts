import { describe, expect, it, vi } from "vitest";

// notify.ts talks to the database and the mail provider at call time only; the arithmetic under test needs neither.
vi.mock("./supabase/server", () => ({ supabaseAdmin: () => ({}) }));

import { weekNumbers, type WeekRow } from "./notify";

const day = 86_400_000;
const now = Date.UTC(2026, 9, 12, 9);
const iso = (daysAgo: number) => new Date(now - daysAgo * day).toISOString();
const since = iso(7);
const row = (over: Partial<WeekRow>): WeekRow => ({ status: "open", client_review: null, triage_state: null, created_at: iso(1), resolved_at: null, ...over });

describe("weekNumbers", () => {
  it("is all zeros for a project with no comments", () => {
    expect(weekNumbers([], since, now)).toEqual({ came: 0, closed: 0, open: 0, inProgress: 0, waitingOnClient: 0, needDecision: 0, oldestOpenDays: null });
  });

  it("counts what came in and what was closed inside the week only", () => {
    const n = weekNumbers(
      [
        row({ created_at: iso(2) }),
        row({ created_at: iso(30) }),
        row({ status: "resolved", created_at: iso(30), resolved_at: iso(3) }),
        row({ status: "resolved", created_at: iso(40), resolved_at: iso(20) }),
      ],
      since,
      now,
    );
    expect(n.came).toBe(1);
    expect(n.closed).toBe(1);
  });

  it("splits what is left by where it stands", () => {
    const n = weekNumbers(
      [
        row({}),
        row({ triage_state: "ready" }),
        row({ status: "in_progress" }),
        row({ status: "resolved", client_review: "pending", resolved_at: iso(1) }),
        row({ status: "resolved", client_review: "approved", resolved_at: iso(1) }),
      ],
      since,
      now,
    );
    expect(n).toMatchObject({ open: 2, inProgress: 1, waitingOnClient: 1, needDecision: 1 });
  });

  it("reports the age of the oldest comment that is still open, ignoring resolved ones", () => {
    const n = weekNumbers([row({ created_at: iso(12) }), row({ status: "in_progress", created_at: iso(20) }), row({ status: "resolved", created_at: iso(90), resolved_at: iso(50) })], since, now);
    expect(n.oldestOpenDays).toBe(20);
  });
});
