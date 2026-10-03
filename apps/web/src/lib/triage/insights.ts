import type { Priority, Triage } from "@bn/shared";

/**
 * What triage found that a person should act on. A clear comment produces none of these: it is
 * labelled (title, category) and otherwise left alone, so the AI only speaks when it adds something.
 */
export type Insight =
  | { kind: "clarify"; question: string }
  | { kind: "duplicate"; of: number }
  | { kind: "priority"; from: Priority; to: Priority; reason: string | null }
  | { kind: "scope"; reason: string | null };

export function triageInsights(triage: Triage | null | undefined, authorPriority: Priority): Insight[] {
  if (!triage) return [];
  const out: Insight[] = [];
  if (triage.needsClarification && triage.clarificationQuestion) out.push({ kind: "clarify", question: triage.clarificationQuestion });
  if (triage.duplicateOf) out.push({ kind: "duplicate", of: triage.duplicateOf });
  if (triage.priority !== authorPriority) out.push({ kind: "priority", from: authorPriority, to: triage.priority, reason: triage.reason ?? null });
  if (triage.scope === "new_work") out.push({ kind: "scope", reason: triage.reason ?? null });
  return out;
}
