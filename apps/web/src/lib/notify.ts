import { sendEmail } from "./email";
import { env } from "./env";
import { supabaseAdmin } from "./supabase/server";
import { originOf } from "./urls";
import { signStatusToken, signWidgetToken } from "./widget/token";

type Payload =
  | { event: "comment.created"; comment_id: string }
  | { event: "comment.assigned"; comment_id: string; assignee_id: string }
  | { event: "reply.created"; reply_id: string }
  | { event: "review.requested"; comment_id: string }
  | { event: "review.rejected"; comment_id: string }
  | { event: "digest"; user_id: string; since: string }
  | { event: "review.reminder"; project_id: string; guest_id: string }
  | { event: "weekly"; user_id: string; since: string };

type Pref = "new_comments" | "assignments" | "replies";
type Recipient = { email: string; name: string; kind: "member" | "guest" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function loadComment(id: string) {
  const { data } = await supabaseAdmin()
    .from("comments")
    .select("id, number, body, title, project_id, page_id, author_user_id, author_guest_id, author_name, assignee_id, projects(name, workspace_id), pages(url, title)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const project = data.projects as unknown as { name: string; workspace_id: string };
  const page = data.pages as unknown as { url: string; title: string };
  return { ...data, project, page };
}

/**
 * Members who want this kind of email. No preferences row means everything on. With `digest: "skip"`,
 * members who chose the daily digest are left out: they get it in tomorrow's email instead.
 */
async function members(userIds: string[], pref: Pref, digest: "skip" | "ignore" = "ignore"): Promise<Recipient[]> {
  if (userIds.length === 0) return [];
  const admin = supabaseAdmin();
  // select("*") so this keeps working on a database where the daily_digest column does not exist yet.
  const [{ data: profiles }, { data: prefs }] = await Promise.all([
    admin.from("profiles").select("id, name, email").in("id", userIds),
    admin.from("notification_prefs").select("*").in("user_id", userIds),
  ]);
  const off = new Set(
    ((prefs ?? []) as Record<string, unknown>[]).filter((p) => p[pref] === false || (digest === "skip" && p.daily_digest === true)).map((p) => p.user_id as string),
  );
  return (profiles ?? []).filter((p) => p.email && !off.has(p.id)).map((p) => ({ email: p.email, name: p.name || p.email, kind: "member" as const }));
}

function commentLink(c: { project_id: string; page_id: string; id: string }) {
  return `${env().APP_URL}/p/${c.project_id}?page=${c.page_id}&c=${c.id}`;
}

/**
 * A link that opens the page in feedback mode on one comment, already signed in as the client it
 * was emailed to. It only works while the project still has an active share link, so turning
 * client access off also turns these off; without one the client just gets the page.
 */
export async function clientLink(c: { id: string; project_id: string; page: { url: string } }, guest: { id: string; name: string }): Promise<string> {
  const origin = originOf(c.page.url);
  const link = await activeShareLink(c.project_id);
  if (!origin || !link) return c.page.url;
  const token = await signWidgetToken({ sub: guest.id, kind: "guest", pid: c.project_id, org: origin, name: guest.name, sl: link.id }, "7d");
  return `${c.page.url}#bn_token=${encodeURIComponent(token)}&bn_c=${c.id}`;
}

async function activeShareLink(projectId: string) {
  const { data: links } = await supabaseAdmin().from("share_links").select("id, expires_at").eq("project_id", projectId).is("revoked_at", null);
  return (links ?? []).find((l) => !l.expires_at || Date.parse(l.expires_at) > Date.now()) ?? null;
}

/** The client's status page: every comment they left on this project and where it stands. Null when client access is off. */
export async function statusLink(projectId: string, guestId: string): Promise<string | null> {
  const link = await activeShareLink(projectId);
  if (!link) return null;
  return `${env().APP_URL}/s/status/${await signStatusToken({ sub: guestId, pid: projectId, sl: link.id })}`;
}

const ALL_YOURS = "See where all your comments stand";

function layout(o: { eyebrow: string; heading: string; quote: string; meta: string; cta: { label: string; url: string }; also?: { label: string; url: string } | null }) {
  const html = `<!doctype html><html><body style="margin:0;background:#fffef4;font-family:Satoshi,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0a0a0a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;box-shadow:0 0 0 1px #e9e6d8">
<tr><td style="padding:24px 28px 0"><span style="font-weight:700;letter-spacing:-0.01em">BASENINE</span> <span style="color:#b8245f;font-family:ui-monospace,Menlo,monospace;font-size:13px">Feedback</span></td></tr>
<tr><td style="padding:20px 28px 0"><div style="font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#6b665e">${esc(o.eyebrow)}</div>
<h1 style="margin:8px 0 0;font-size:20px;font-weight:500;letter-spacing:-0.02em;line-height:1.3">${esc(o.heading)}</h1></td></tr>
<tr><td style="padding:16px 28px 0"><div style="border-left:3px solid #ffacca;background:#fff0f5;border-radius:8px;padding:12px 14px;font-size:15px;line-height:1.55;white-space:pre-wrap">${esc(o.quote)}</div>
<div style="margin-top:10px;font-size:13px;color:#6b665e">${esc(o.meta)}</div></td></tr>
<tr><td style="padding:22px 28px 28px"><a href="${esc(o.cta.url)}" style="display:inline-block;background:#96ff7c;color:#0a0a0a;text-decoration:none;font-weight:500;font-size:14px;padding:11px 18px;border-radius:10px">${esc(o.cta.label)}</a>${
    o.also ? `<div style="margin-top:14px;font-size:13px"><a href="${esc(o.also.url)}" style="color:#6b665e">${esc(o.also.label)}</a></div>` : ""
  }</td></tr>
</table>
<div style="max-width:520px;padding:14px 8px;font-size:12px;color:#6b665e">${o.also ? "You are getting this because you left feedback on this site." : "You can turn these emails off in Basenine Feedback → Account."}</div>
</td></tr></table></body></html>`;
  const text = `${o.eyebrow}\n\n${o.heading}\n\n"${o.quote}"\n${o.meta}\n\n${o.cta.label}: ${o.cta.url}\n${o.also ? `${o.also.label}: ${o.also.url}\n` : ""}`;
  return { html, text };
}

const DIGEST_PER_PROJECT = 8;
const SHELL_OPEN = `<!doctype html><html><body style="margin:0;background:#fffef4;font-family:Satoshi,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0a0a0a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;box-shadow:0 0 0 1px #e9e6d8">
<tr><td style="padding:24px 28px 0"><span style="font-weight:700;letter-spacing:-0.01em">BASENINE</span> <span style="color:#b8245f;font-family:ui-monospace,Menlo,monospace;font-size:13px">Feedback</span></td></tr>`;

/** One email with every comment made since `since`, grouped by project. Sends nothing when nothing is new. */
async function handleDigest(userId: string, since: string): Promise<void> {
  const admin = supabaseAdmin();
  const [recipient] = await members([userId], "new_comments");
  if (!recipient) return;
  const { data: ws } = await admin.from("workspace_members").select("workspace_id").eq("user_id", userId);
  const workspaceIds = (ws ?? []).map((w) => w.workspace_id);
  if (workspaceIds.length === 0) return;
  const { data: projects } = await admin.from("projects").select("id, name").in("workspace_id", workspaceIds).order("name");
  if (!projects?.length) return;
  const { data: rows } = await admin
    .from("comments")
    .select("id, number, title, body, project_id, page_id, author_user_id, author_guest_id, author_name, status")
    .in("project_id", projects.map((p) => p.id))
    .gte("created_at", since)
    .is("context->qa", null) // page-check findings are filed in bulk and never emailed
    .order("created_at");
  const comments = (rows ?? []).filter((c) => c.author_user_id !== userId);
  if (comments.length === 0) return;

  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const sections = projects
    .map((p) => ({ project: p, items: comments.filter((c) => c.project_id === p.id) }))
    .filter((g) => g.items.length > 0)
    .map((g) => ({
      name: g.project.name,
      url: `${env().APP_URL}/p/${g.project.id}`,
      more: Math.max(0, g.items.length - DIGEST_PER_PROJECT),
      lines: g.items.slice(0, DIGEST_PER_PROJECT).map((c) => ({
        label: `#${c.number} ${clip(c.title ?? c.body, 90)}`,
        by: `${c.author_guest_id ? `${c.author_name} (client)` : c.author_name}${c.status === "resolved" ? " · already resolved" : ""}`,
        url: commentLink(c),
      })),
    }));
  const summary = `${plural(comments.length, "new comment")} on ${sections.length === 1 ? sections[0]!.name : plural(sections.length, "project")}`;

  const item = (l: { label: string; by: string; url: string }) =>
    `<div style="margin-top:8px;border-left:3px solid #ffacca;background:#fff0f5;border-radius:8px;padding:9px 12px;font-size:14px;line-height:1.45"><a href="${esc(l.url)}" style="color:#0a0a0a;text-decoration:none">${esc(l.label)}</a><div style="font-size:12px;color:#6b665e">${esc(l.by)}</div></div>`;
  const section = (s: (typeof sections)[number]) =>
    `<tr><td style="padding:20px 28px 0"><a href="${esc(s.url)}" style="color:#0a0a0a;font-weight:500;font-size:15px;text-decoration:none">${esc(s.name)}</a>${s.lines.map(item).join("")}${
      s.more ? `<div style="margin-top:8px;font-size:13px;color:#6b665e">and ${s.more} more in ${esc(s.name)}</div>` : ""
    }</td></tr>`;
  const html = `${SHELL_OPEN}
<tr><td style="padding:20px 28px 0"><div style="font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#6b665e">Daily digest · last 24 hours</div>
<h1 style="margin:8px 0 0;font-size:20px;font-weight:500;letter-spacing:-0.02em;line-height:1.3">${esc(summary)}</h1></td></tr>
${sections.map(section).join("")}
<tr><td style="padding:22px 28px 28px"><a href="${esc(env().APP_URL)}" style="display:inline-block;background:#96ff7c;color:#0a0a0a;text-decoration:none;font-weight:500;font-size:14px;padding:11px 18px;border-radius:10px">Open Basenine Feedback</a></td></tr>
</table>
<div style="max-width:520px;padding:14px 8px;font-size:12px;color:#6b665e">You chose one email a day for new comments. Change it in Basenine Feedback → Account.</div>
</td></tr></table></body></html>`;
  const text = [
    `Daily digest: ${summary}`,
    ...sections.map((s) => [s.name, ...s.lines.map((l) => `- ${l.label} (${l.by})\n  ${l.url}`), ...(s.more ? [`  and ${s.more} more: ${s.url}`] : [])].join("\n")),
  ].join("\n\n");
  await deliver([recipient], `Daily digest: ${summary}`, () => ({ html, text: `${text}\n` }));
}

export interface WeekRow {
  status: string;
  client_review: string | null;
  triage_state: string | null;
  created_at: string;
  resolved_at: string | null;
}

/** One project's week in numbers. Pure, so the arithmetic is tested without a database. */
export function weekNumbers(rows: readonly WeekRow[], since: string, now: number) {
  const from = Date.parse(since);
  const open = rows.filter((r) => r.status !== "resolved");
  const oldest = open.reduce((min, r) => Math.min(min, Date.parse(r.created_at)), Infinity);
  return {
    came: rows.filter((r) => Date.parse(r.created_at) >= from).length,
    closed: rows.filter((r) => r.resolved_at && Date.parse(r.resolved_at) >= from).length,
    open: open.filter((r) => r.status === "open").length,
    inProgress: open.filter((r) => r.status === "in_progress").length,
    waitingOnClient: rows.filter((r) => r.status === "resolved" && r.client_review === "pending").length,
    needDecision: open.filter((r) => r.triage_state === "ready").length,
    oldestOpenDays: Number.isFinite(oldest) ? Math.floor((now - oldest) / 86_400_000) : null,
  };
}

/** Monday's summary for one member: where each of their projects stands. Sends nothing when nothing is open and nothing moved. */
async function handleWeekly(userId: string, since: string): Promise<void> {
  const admin = supabaseAdmin();
  const [{ data: profile }, { data: prefs }, { data: ws }] = await Promise.all([
    admin.from("profiles").select("id, name, email").eq("id", userId).maybeSingle(),
    admin.from("notification_prefs").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("workspace_members").select("workspace_id").eq("user_id", userId),
  ]);
  // Switched off between being queued and now.
  if (!profile?.email || (prefs as Record<string, unknown> | null)?.weekly_summary !== true) return;
  const workspaceIds = (ws ?? []).map((w) => w.workspace_id);
  if (workspaceIds.length === 0) return;
  const { data: projects } = await admin.from("projects").select("id, name").in("workspace_id", workspaceIds).is("archived_at", null).order("name");
  if (!projects?.length) return;
  const { data: rows } = await admin
    .from("comments")
    .select("project_id, status, client_review, triage_state, created_at, resolved_at")
    .in("project_id", projects.map((p) => p.id))
    .is("context->qa", null);

  const now = Date.now();
  const sections = projects
    .map((p) => ({ name: p.name, url: `${env().APP_URL}/p/${p.id}/board`, n: weekNumbers((rows ?? []).filter((r) => r.project_id === p.id), since, now) }))
    .filter((s) => s.n.came + s.n.closed + s.n.open + s.n.inProgress + s.n.waitingOnClient > 0);
  if (sections.length === 0) return;

  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const totalOpen = sections.reduce((sum, s) => sum + s.n.open + s.n.inProgress, 0);
  const summary = `${plural(sections.length, "project")}, ${totalOpen} still to do`;
  const facts = (n: ReturnType<typeof weekNumbers>) =>
    [
      `${n.came} came in, ${n.closed} closed this week`,
      `${n.open} open, ${n.inProgress} in progress`,
      ...(n.waitingOnClient ? [`${n.waitingOnClient} waiting for the client to confirm`] : []),
      ...(n.needDecision ? [`${plural(n.needDecision, "AI flag")} waiting for a decision`] : []),
      ...(n.oldestOpenDays !== null && n.oldestOpenDays >= 7 ? [`oldest open comment: ${n.oldestOpenDays} days`] : []),
    ];

  const html = `${SHELL_OPEN}
<tr><td style="padding:20px 28px 0"><div style="font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#6b665e">Weekly summary · last 7 days</div>
<h1 style="margin:8px 0 0;font-size:20px;font-weight:500;letter-spacing:-0.02em;line-height:1.3">${esc(summary)}</h1></td></tr>
${sections
    .map(
      (s) => `<tr><td style="padding:18px 28px 0"><a href="${esc(s.url)}" style="color:#0a0a0a;font-weight:500;font-size:15px;text-decoration:none">${esc(s.name)}</a>
<div style="margin-top:8px;border-left:3px solid #ffacca;background:#fff0f5;border-radius:8px;padding:9px 12px;font-size:14px;line-height:1.6">${facts(s.n).map(esc).join("<br>")}</div></td></tr>`,
    )
    .join("")}
<tr><td style="padding:22px 28px 28px"><a href="${esc(env().APP_URL)}" style="display:inline-block;background:#96ff7c;color:#0a0a0a;text-decoration:none;font-weight:500;font-size:14px;padding:11px 18px;border-radius:10px">Open Basenine Feedback</a></td></tr>
</table>
<div style="max-width:520px;padding:14px 8px;font-size:12px;color:#6b665e">You asked for a summary every Monday. Change it in Basenine Feedback → Account.</div>
</td></tr></table></body></html>`;
  const text = [`Weekly summary: ${summary}`, ...sections.map((s) => [s.name, ...facts(s.n).map((f) => `- ${f}`), `  ${s.url}`].join("\n"))].join("\n\n");
  await deliver([{ email: profile.email, name: profile.name || profile.email, kind: "member" }], `Weekly summary: ${summary}`, () => ({ html, text: `${text}\n` }));
}

/**
 * Ask a client to confirm a fix. When the team resolves several of one client's comments in a row
 * (a batch on the board, or one after another), the client gets one email listing them all, not one
 * each: the first job to run covers every comment of theirs that is waiting and has not been asked
 * about yet, records that in each comment's history, and the jobs for the others then find nothing to do.
 */
async function handleReviewRequest(commentId: string): Promise<void> {
  const admin = supabaseAdmin();
  const c = await loadComment(commentId);
  if (!c?.author_guest_id) return;
  const { data: guest } = await admin.from("guests").select("id, email, name").eq("id", c.author_guest_id).maybeSingle();
  if (!guest) return;

  const { data: pending } = await admin
    .from("comments")
    .select("id, number, body, project_id, resolved_at, page:pages(url, title)")
    .eq("project_id", c.project_id)
    .eq("author_guest_id", guest.id)
    .eq("status", "resolved")
    .eq("client_review", "pending")
    .order("number");
  const rows = (pending ?? []) as unknown as { id: string; number: number; body: string; project_id: string; resolved_at: string | null; page: { url: string; title: string | null } }[];
  if (rows.length === 0) return; // answered, or reopened, before this ran
  const { data: asked } = await admin.from("activity").select("comment_id, created_at").eq("action", "client.asked").in("comment_id", rows.map((r) => r.id));
  const alreadyAsked = (r: (typeof rows)[number]) => (asked ?? []).some((a) => a.comment_id === r.id && (!r.resolved_at || Date.parse(a.created_at) >= Date.parse(r.resolved_at)));
  const due = rows.filter((r) => !alreadyAsked(r));
  if (due.length === 0) return;

  // Recorded before sending: a second job starting now sees these as handled.
  await admin.from("activity").insert(due.map((r) => ({ project_id: r.project_id, comment_id: r.id, actor_user_id: null, actor_name: "Automation", action: "client.asked" })));

  const status = await statusLink(c.project_id, guest.id);
  const to: Recipient[] = [{ email: guest.email, name: guest.name, kind: "guest" }];
  if (due.length === 1) {
    const only = due[0]!;
    const url = await clientLink(only, guest);
    await deliver(to, `Done on ${c.project.name}: does this look right?`, () =>
      layout({
        eyebrow: `${c.project.name} · ready for you to check`,
        heading: "We've made this change. Does it look right?",
        quote: clip(only.body, 600),
        meta: "Open the page and choose Looks good or Not yet on your comment.",
        cta: { label: "Check it on the page", url },
        also: status ? { label: ALL_YOURS, url: status } : null,
      }),
    );
    return;
  }

  const lines: { label: string; url: string }[] = [];
  for (const r of due) lines.push({ label: `#${r.number} ${clip(r.body, 110)}`, url: await clientLink(r, guest) });
  const heading = `We've made ${due.length} changes. Do they look right?`;
  const html = `${SHELL_OPEN}
<tr><td style="padding:20px 28px 0"><div style="font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#6b665e">${esc(c.project.name)} · ready for you to check</div>
<h1 style="margin:8px 0 0;font-size:20px;font-weight:500;letter-spacing:-0.02em;line-height:1.3">${esc(heading)}</h1>
<div style="margin-top:8px;font-size:14px;line-height:1.5;color:#6b665e">Open each one and choose Looks good or Not yet on your comment.</div></td></tr>
<tr><td style="padding:12px 28px 0">${lines
    .map((l) => `<div style="margin-top:8px;border-left:3px solid #ffacca;background:#fff0f5;border-radius:8px;padding:9px 12px;font-size:14px;line-height:1.45">${esc(l.label)}<div style="margin-top:4px"><a href="${esc(l.url)}" style="color:#0a0a0a;font-weight:500">Check it on the page</a></div></div>`)
    .join("")}</td></tr>
<tr><td style="padding:22px 28px 28px">${status ? `<a href="${esc(status)}" style="display:inline-block;background:#96ff7c;color:#0a0a0a;text-decoration:none;font-weight:500;font-size:14px;padding:11px 18px;border-radius:10px">See them all</a>` : ""}</td></tr>
</table>
<div style="max-width:520px;padding:14px 8px;font-size:12px;color:#6b665e">You are getting this because you left feedback on this site.</div>
</td></tr></table></body></html>`;
  const text = [
    `${c.project.name}: ${heading}`,
    "Open each one and choose Looks good or Not yet on your comment.",
    lines.map((l) => `- ${l.label}\n  Check it on the page: ${l.url}`).join("\n"),
    ...(status ? [`${ALL_YOURS}: ${status}`] : []),
  ].join("\n\n");
  await deliver(to, `Done on ${c.project.name}: ${due.length} changes for you to check`, () => ({ html, text: `${text}\n` }));
}

/** One email to a client listing everything of theirs still waiting for a Looks good / Not yet. */
async function handleReminder(projectId: string, guestId: string): Promise<void> {
  const admin = supabaseAdmin();
  const [{ data: guest }, { data: project }, { data: rows }] = await Promise.all([
    admin.from("guests").select("id, email, name").eq("id", guestId).eq("project_id", projectId).maybeSingle(),
    admin.from("projects").select("id, name, archived_at").eq("id", projectId).maybeSingle(),
    admin
      .from("comments")
      .select("id, number, body, project_id, page:pages(url, title)")
      .eq("project_id", projectId)
      .eq("author_guest_id", guestId)
      .eq("status", "resolved")
      .eq("client_review", "pending")
      .order("number"),
  ]);
  // They may have answered between the reminder being queued and now.
  const waiting = (rows ?? []) as unknown as { id: string; number: number; body: string; project_id: string; page: { url: string; title: string | null } }[];
  if (!guest || !project || project.archived_at || waiting.length === 0) return;

  const lines: { label: string; url: string }[] = [];
  for (const c of waiting) lines.push({ label: `#${c.number} ${clip(c.body, 110)}`, url: await clientLink(c, guest) });
  const status = await statusLink(projectId, guest.id);
  const heading = waiting.length === 1 ? "One change is waiting for you to check" : `${waiting.length} changes are waiting for you to check`;
  const cta = { label: waiting.length === 1 ? "Check it on the page" : "See them all", url: waiting.length === 1 || !status ? lines[0]!.url : status };

  const html = `${SHELL_OPEN}
<tr><td style="padding:20px 28px 0"><div style="font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#6b665e">${esc(project.name)} · a reminder</div>
<h1 style="margin:8px 0 0;font-size:20px;font-weight:500;letter-spacing:-0.02em;line-height:1.3">${esc(heading)}</h1>
<div style="margin-top:8px;font-size:14px;line-height:1.5;color:#6b665e">The team made these changes a few days ago. Open each one and choose Looks good or Not yet.</div></td></tr>
<tr><td style="padding:12px 28px 0">${lines
    .map((l) => `<div style="margin-top:8px;border-left:3px solid #ffacca;background:#fff0f5;border-radius:8px;padding:9px 12px;font-size:14px;line-height:1.45"><a href="${esc(l.url)}" style="color:#0a0a0a;text-decoration:none">${esc(l.label)}</a></div>`)
    .join("")}</td></tr>
<tr><td style="padding:22px 28px 28px"><a href="${esc(cta.url)}" style="display:inline-block;background:#96ff7c;color:#0a0a0a;text-decoration:none;font-weight:500;font-size:14px;padding:11px 18px;border-radius:10px">${esc(cta.label)}</a></td></tr>
</table>
<div style="max-width:520px;padding:14px 8px;font-size:12px;color:#6b665e">You are getting this because you left feedback on this site. This is the only reminder for these changes.</div>
</td></tr></table></body></html>`;
  const text = [
    `${project.name}: ${heading}`,
    "The team made these changes a few days ago. Open each one and choose Looks good or Not yet.",
    lines.map((l) => `- ${l.label}\n  ${l.url}`).join("\n"),
    ...(status ? [`${ALL_YOURS}: ${status}`] : []),
  ].join("\n\n");
  await deliver([{ email: guest.email, name: guest.name, kind: "guest" }], `Reminder: ${heading.toLowerCase()} on ${project.name}`, () => ({ html, text: `${text}\n` }));
}

async function deliver(recipients: Recipient[], subject: string, build: (r: Recipient) => { html: string; text: string }) {
  const seen = new Set<string>();
  for (const r of recipients) {
    const key = r.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const result = await sendEmail({ to: r.email, subject, ...build(r) });
    if (!result.sent) console.warn(`[notify] not sent to ${r.email}: ${result.reason}`);
  }
}

export async function handleNotify(p: Payload): Promise<void> {
  const admin = supabaseAdmin();

  if (p.event === "digest") return handleDigest(p.user_id, p.since);
  if (p.event === "review.reminder") return handleReminder(p.project_id, p.guest_id);
  if (p.event === "weekly") return handleWeekly(p.user_id, p.since);

  if (p.event === "comment.created") {
    const c = await loadComment(p.comment_id);
    if (!c) return;
    const { data: ws } = await admin.from("workspace_members").select("user_id").eq("workspace_id", c.project.workspace_id);
    const ids = (ws ?? []).map((m) => m.user_id).filter((id) => id !== c.author_user_id);
    const who = c.author_guest_id ? `${c.author_name} (client)` : c.author_name;
    await deliver(await members(ids, "new_comments", "skip"), `New comment #${c.number} on ${c.project.name}: ${clip(c.body, 60)}`, () =>
      layout({
        eyebrow: `${c.project.name} · ${c.page.title || new URL(c.page.url).pathname}`,
        heading: `${who} left comment #${c.number}`,
        quote: clip(c.body, 600),
        meta: c.page.url,
        cta: { label: "Open in Basenine Feedback", url: commentLink(c) },
      }),
    );
    return;
  }

  if (p.event === "comment.assigned") {
    const c = await loadComment(p.comment_id);
    if (!c || c.assignee_id !== p.assignee_id) return; // reassigned again before we got here
    await deliver(await members([p.assignee_id], "assignments"), `Assigned to you: #${c.number} on ${c.project.name}`, () =>
      layout({
        eyebrow: `${c.project.name} · assigned to you`,
        heading: c.title ?? `Comment #${c.number}`,
        quote: clip(c.body, 600),
        meta: `From ${c.author_name} · ${c.page.url}`,
        cta: { label: "Open the comment", url: commentLink(c) },
      }),
    );
    return;
  }

  if (p.event === "review.requested") return handleReviewRequest(p.comment_id);

  if (p.event === "review.rejected") {
    const c = await loadComment(p.comment_id);
    if (!c) return;
    const { data: ws } = await admin.from("workspace_members").select("user_id").eq("workspace_id", c.project.workspace_id);
    await deliver(await members((ws ?? []).map((m) => m.user_id), "new_comments"), `Not fixed yet: #${c.number} on ${c.project.name}`, () =>
      layout({
        eyebrow: `${c.project.name} · sent back by the client`,
        heading: `${c.author_name} says #${c.number} isn't right yet`,
        quote: clip(c.body, 600),
        meta: "It has been reopened. Their note, if they left one, is in the thread.",
        cta: { label: "Open the comment", url: commentLink(c) },
      }),
    );
    return;
  }

  const { data: reply } = await admin.from("replies").select("id, comment_id, author_user_id, author_guest_id, author_name, body").eq("id", p.reply_id).maybeSingle();
  if (!reply) return;
  const c = await loadComment(reply.comment_id);
  if (!c) return;

  const memberIds = [c.author_user_id, c.assignee_id].filter((id): id is string => !!id && id !== reply.author_user_id);
  const recipients = await members(memberIds, "replies");
  // Clients who commented through a share link gave their email so the team could answer them.
  let guestUrl = c.page.url;
  let guestStatus: string | null = null;
  if (c.author_guest_id && c.author_guest_id !== reply.author_guest_id) {
    const { data: guest } = await admin.from("guests").select("id, email, name").eq("id", c.author_guest_id).maybeSingle();
    if (guest) {
      recipients.push({ email: guest.email, name: guest.name, kind: "guest" });
      guestUrl = await clientLink(c, guest);
      guestStatus = await statusLink(c.project_id, guest.id);
    }
  }
  await deliver(recipients, `${reply.author_name} replied to #${c.number} on ${c.project.name}`, (r) =>
    layout({
      eyebrow: `${c.project.name} · reply to your comment`,
      heading: `${reply.author_name} replied`,
      quote: clip(reply.body, 600),
      meta: `On: "${clip(c.body, 120)}"`,
      cta: r.kind === "guest" ? { label: "Reply on the page", url: guestUrl } : { label: "Open the conversation", url: commentLink(c) },
      also: r.kind === "guest" && guestStatus ? { label: ALL_YOURS, url: guestStatus } : null,
    }),
  );
}
