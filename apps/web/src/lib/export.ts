import type { DashboardComment } from "./data";

/**
 * Markdown a coding agent (Claude Code, Cursor, …) can act on directly: where the element is, what
 * it looks like now, what was asked, and what changed since. Same spirit as Agentation's output.
 */
export function commentToMarkdown(c: DashboardComment, pageUrl: string): string {
  const ctx = c.context;
  const lines = [`## Feedback #${c.number}: ${c.title ?? firstLine(c.body)}`, ""];
  lines.push(`- **Page:** ${pageUrl}`);
  if (ctx.breakpoint || ctx.viewport) lines.push(`- **Viewport:** ${ctx.breakpoint ?? ""} ${ctx.viewport ? `${ctx.viewport.w}×${ctx.viewport.h}` : ""} · ${ctx.browser ?? ""} on ${ctx.os ?? ""}`.trim());
  if (c.anchor) {
    lines.push(`- **Element:** \`${c.anchor.selector}\`${c.anchor.excerpt ? ` "${c.anchor.excerpt.slice(0, 80)}"` : ""}`);
    if (c.anchor.classes.length) lines.push(`- **Webflow classes:** ${c.anchor.classes.map((x) => `\`${x}\``).join(" ")}`);
    lines.push(`- **DOM path:** \`${c.anchor.path}\``);
  }
  lines.push(`- **Status / priority:** ${c.status} / ${c.priority}${c.category ? ` · ${c.category}` : ""}`);
  lines.push("", `**Request (${c.author_name}):**`, "", quote(c.body));
  if (c.triage && c.triage_state !== "dismissed") lines.push("", `**Task:** ${c.triage.task}`);
  const changes = c.change_summary?.changes ?? [];
  if (changes.length) {
    lines.push("", "**Changed since this comment:**");
    for (const ch of changes) lines.push(`- ${ch.field}: ${ch.from} → ${ch.to}`);
  }
  if (c.anchor_state === "detached") lines.push("", "_The commented element is no longer on the page._");
  return lines.join("\n");
}

export function commentsToMarkdown(list: DashboardComment[], pageUrlOf: (c: DashboardComment) => string): string {
  return [`# Open feedback (${list.length})`, "", ...list.map((c) => commentToMarkdown(c, pageUrlOf(c)) + "\n")].join("\n");
}

function firstLine(s: string) {
  const l = s.split("\n")[0] ?? "";
  return l.length > 80 ? `${l.slice(0, 79)}…` : l;
}

function quote(s: string) {
  return s
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
}

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return "just now";
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["minute", 60],
    ["hour", 3600],
    ["day", 86400],
    ["week", 604800],
    ["month", 2592000],
    ["year", 31536000],
  ];
  let [unit, size] = units[0]!;
  for (const [u, n] of units) if (s >= n) [unit, size] = [u, n];
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-Math.round(s / size), unit);
}
