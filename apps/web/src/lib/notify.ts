import { sendEmail } from "./email";
import { env } from "./env";
import { supabaseAdmin } from "./supabase/server";

type Payload =
  | { event: "comment.created"; comment_id: string }
  | { event: "comment.assigned"; comment_id: string; assignee_id: string }
  | { event: "reply.created"; reply_id: string };

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

/** Members who want this kind of email. No preferences row means everything on. */
async function members(userIds: string[], pref: Pref): Promise<Recipient[]> {
  if (userIds.length === 0) return [];
  const admin = supabaseAdmin();
  const [{ data: profiles }, { data: prefs }] = await Promise.all([
    admin.from("profiles").select("id, name, email").in("id", userIds),
    admin.from("notification_prefs").select(`user_id, ${pref}`).in("user_id", userIds),
  ]);
  const off = new Set((prefs ?? []).filter((p) => (p as Record<string, unknown>)[pref] === false).map((p) => p.user_id));
  return (profiles ?? []).filter((p) => p.email && !off.has(p.id)).map((p) => ({ email: p.email, name: p.name || p.email, kind: "member" as const }));
}

function commentLink(c: { project_id: string; page_id: string; id: string }) {
  return `${env().APP_URL}/p/${c.project_id}?page=${c.page_id}&c=${c.id}`;
}

function layout(o: { eyebrow: string; heading: string; quote: string; meta: string; cta: { label: string; url: string } }) {
  const html = `<!doctype html><html><body style="margin:0;background:#fffef4;font-family:Satoshi,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0a0a0a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;box-shadow:0 0 0 1px #e9e6d8">
<tr><td style="padding:24px 28px 0"><span style="font-weight:700;letter-spacing:-0.01em">BASENINE</span> <span style="color:#b8245f;font-family:ui-monospace,Menlo,monospace;font-size:13px">Feedback</span></td></tr>
<tr><td style="padding:20px 28px 0"><div style="font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#6b665e">${esc(o.eyebrow)}</div>
<h1 style="margin:8px 0 0;font-size:20px;font-weight:500;letter-spacing:-0.02em;line-height:1.3">${esc(o.heading)}</h1></td></tr>
<tr><td style="padding:16px 28px 0"><div style="border-left:3px solid #ffacca;background:#fff0f5;border-radius:8px;padding:12px 14px;font-size:15px;line-height:1.55;white-space:pre-wrap">${esc(o.quote)}</div>
<div style="margin-top:10px;font-size:13px;color:#6b665e">${esc(o.meta)}</div></td></tr>
<tr><td style="padding:22px 28px 28px"><a href="${esc(o.cta.url)}" style="display:inline-block;background:#96ff7c;color:#0a0a0a;text-decoration:none;font-weight:500;font-size:14px;padding:11px 18px;border-radius:10px">${esc(o.cta.label)}</a></td></tr>
</table>
<div style="max-width:520px;padding:14px 8px;font-size:12px;color:#6b665e">You can turn these emails off in Basenine Feedback → Account.</div>
</td></tr></table></body></html>`;
  const text = `${o.eyebrow}\n\n${o.heading}\n\n"${o.quote}"\n${o.meta}\n\n${o.cta.label}: ${o.cta.url}\n`;
  return { html, text };
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

  if (p.event === "comment.created") {
    const c = await loadComment(p.comment_id);
    if (!c) return;
    const { data: ws } = await admin.from("workspace_members").select("user_id").eq("workspace_id", c.project.workspace_id);
    const ids = (ws ?? []).map((m) => m.user_id).filter((id) => id !== c.author_user_id);
    const who = c.author_guest_id ? `${c.author_name} (client)` : c.author_name;
    await deliver(await members(ids, "new_comments"), `New comment #${c.number} on ${c.project.name}: ${clip(c.body, 60)}`, () =>
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

  const { data: reply } = await admin.from("replies").select("id, comment_id, author_user_id, author_guest_id, author_name, body").eq("id", p.reply_id).maybeSingle();
  if (!reply) return;
  const c = await loadComment(reply.comment_id);
  if (!c) return;

  const memberIds = [c.author_user_id, c.assignee_id].filter((id): id is string => !!id && id !== reply.author_user_id);
  const recipients = await members(memberIds, "replies");
  // Clients who commented through a share link gave their email so the team could answer them.
  if (c.author_guest_id && c.author_guest_id !== reply.author_guest_id) {
    const { data: guest } = await admin.from("guests").select("email, name").eq("id", c.author_guest_id).maybeSingle();
    if (guest) recipients.push({ email: guest.email, name: guest.name, kind: "guest" });
  }
  await deliver(recipients, `${reply.author_name} replied to #${c.number} on ${c.project.name}`, (r) =>
    layout({
      eyebrow: `${c.project.name} · reply to your comment`,
      heading: `${reply.author_name} replied`,
      quote: clip(reply.body, 600),
      meta: `On: "${clip(c.body, 120)}"`,
      cta: r.kind === "guest" ? { label: "View the page", url: c.page.url } : { label: "Open the conversation", url: commentLink(c) },
    }),
  );
}
