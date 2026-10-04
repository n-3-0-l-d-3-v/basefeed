import type { DashboardComment } from "./data";

/**
 * One cell. Quoted when it needs to be, and made inert when it starts like a formula: comments are
 * written by clients, and a spreadsheet would otherwise run "=HYPERLINK(...)" from a comment body.
 */
export function csvCell(value: string | number | null | undefined): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADER = ["Number", "Status", "Priority", "Category", "Title", "Comment", "Author", "From", "Assignee", "Page", "Element", "Webflow classes", "Device", "Client sign-off", "Created", "Resolved", "Link"];

const SIGN_OFF: Record<string, string> = { pending: "Waiting for client", approved: "Confirmed by client", rejected: "Sent back by client" };

export function commentsToCsv(
  comments: DashboardComment[],
  o: { pageUrl: (pageId: string) => string; memberName: (userId: string) => string; link: (c: DashboardComment) => string },
): string {
  const rows = comments.map((c) => [
    c.number,
    c.status.replace("_", " "),
    c.priority,
    c.category ?? "",
    c.title ?? "",
    c.body,
    c.author_name,
    c.context.qa ? "Page check" : c.author_guest_id ? "Client" : "Team",
    c.assignee_id ? o.memberName(c.assignee_id) : "",
    o.pageUrl(c.page_id),
    c.anchor?.selector ?? "",
    c.anchor?.classes.join(" ") ?? "",
    [c.context.breakpoint, c.context.viewport ? `${c.context.viewport.w}×${c.context.viewport.h}` : "", c.context.browser, c.context.os].filter(Boolean).join(" · "),
    c.client_review ? (SIGN_OFF[c.client_review] ?? c.client_review) : "",
    c.created_at,
    c.resolved_at ?? "",
    o.link(c),
  ]);
  // A byte-order mark so Excel reads the file as UTF-8; CRLF line ends per RFC 4180.
  return `﻿${[HEADER, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
