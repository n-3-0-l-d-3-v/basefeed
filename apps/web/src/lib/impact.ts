import type { DashboardComment } from "./data";

/**
 * What the tool did on a project, counted from the project's own comments. Every number is a step
 * that would otherwise be a person's: nothing here is an estimate, and no time saved is claimed.
 */
export interface Impact {
  total: number;
  /** Arrived with the element, device and viewport attached, so nobody had to ask where it was. */
  withContext: number;
  /** Given a title and category by triage. */
  labelled: number;
  flags: { vague: number; duplicate: number; priority: number; newWork: number; copy: number };
  /** Commented elements the tool saw change afterwards ("likely fixed"). */
  fixesSpotted: number;
  pins: { onElement: number; flagged: number };
  signOff: { asked: number; confirmed: number; sentBack: number; waiting: number };
  /** Problems the automated page check found (before a client had to). */
  pageCheck: number;
  resolved: number;
  medianHoursToResolve: number | null;
}

type Row = Pick<
  DashboardComment,
  "anchor" | "context" | "triage" | "change_summary" | "anchor_state" | "client_review" | "status" | "created_at" | "resolved_at"
>;

export function impact(comments: readonly Row[]): Impact {
  const out: Impact = {
    total: comments.length,
    withContext: 0,
    labelled: 0,
    flags: { vague: 0, duplicate: 0, priority: 0, newWork: 0, copy: 0 },
    fixesSpotted: 0,
    pins: { onElement: 0, flagged: 0 },
    signOff: { asked: 0, confirmed: 0, sentBack: 0, waiting: 0 },
    pageCheck: 0,
    resolved: 0,
    medianHoursToResolve: null,
  };
  const hours: number[] = [];

  for (const c of comments) {
    if (c.anchor && c.context.viewport && c.context.browser) out.withContext++;

    if (c.context.qa) out.pageCheck++;

    const t = c.triage;
    if (t) {
      out.labelled++;
      if (t.needsClarification) out.flags.vague++;
      if (t.duplicateOf) out.flags.duplicate++;
      if (t.scope === "new_work") out.flags.newWork++;
      // A reason is recorded only for new work or a changed priority.
      else if (t.reason) out.flags.priority++;
      if (t.change) out.flags.copy++;
    }

    if ((c.change_summary?.changes.length ?? 0) > 0) out.fixesSpotted++;
    if (c.anchor) {
      if (c.anchor_state === "suggested" || c.anchor_state === "detached") out.pins.flagged++;
      else out.pins.onElement++;
    }

    if (c.client_review) {
      out.signOff.asked++;
      if (c.client_review === "approved") out.signOff.confirmed++;
      else if (c.client_review === "rejected") out.signOff.sentBack++;
      else out.signOff.waiting++;
    }

    if (c.status === "resolved") {
      out.resolved++;
      if (c.resolved_at) hours.push((Date.parse(c.resolved_at) - Date.parse(c.created_at)) / 3_600_000);
    }
  }

  if (hours.length) {
    hours.sort((a, b) => a - b);
    const mid = Math.floor(hours.length / 2);
    out.medianHoursToResolve = hours.length % 2 ? hours[mid]! : (hours[mid - 1]! + hours[mid]!) / 2;
  }
  return out;
}

export function duration(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} days`;
}
