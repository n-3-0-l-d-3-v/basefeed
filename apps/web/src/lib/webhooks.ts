import { TriageSchema, type Priority } from "@bn/shared";
import { createHmac } from "node:crypto";
import { env } from "./env";
import { supabaseAdmin } from "./supabase/server";
import { triageInsights } from "./triage/insights";
import type { WebhookEvent } from "./webhook-events";
import { urlProblem } from "./webhook-url";

export { WEBHOOK_EVENTS } from "./webhook-events";

interface Job {
  webhook_id: string;
  event: WebhookEvent | "ping";
  comment_id?: string | null;
  actor?: string | null;
  meta?: Record<string, unknown>;
  at?: string;
}

/** Why this deployment refuses a webhook URL, or null when it is fine. */
export const webhookUrlProblem = (raw: string) => urlProblem(raw, env().APP_URL);

export const sign = (secret: string, body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The JSON a receiver gets. `text` is a ready sentence, which is all Slack and Discord need. */
export async function buildPayload(job: Job) {
  const admin = supabaseAdmin();
  const { data: hook } = await admin.from("webhooks").select("id, url, secret, project_id, projects(name)").eq("id", job.webhook_id).maybeSingle();
  if (!hook) return null;
  const project = { id: hook.project_id, name: (hook.projects as unknown as { name: string }).name };
  const base = { event: job.event, at: job.at ?? new Date().toISOString(), project, actor: job.actor ?? null };
  if (job.event === "ping" || !job.comment_id) return { hook, body: { ...base, text: `Basenine Feedback is connected to ${project.name}.` } };

  const { data: c } = await admin
    .from("comments")
    .select("id, number, title, body, status, priority, category, author_name, author_guest_id, page_id, anchor, triage, pages(url)")
    .eq("id", job.comment_id)
    .maybeSingle();
  if (!c) return null; // deleted since: nothing to announce
  const link = `${env().APP_URL}/p/${project.id}?page=${c.page_id}&c=${c.id}`;
  const ref = `#${c.number} on ${project.name}`;
  const quote = `"${clip(c.title ?? c.body, 140)}"`;
  const comment = {
    id: c.id,
    number: c.number,
    title: c.title,
    body: c.body,
    status: c.status,
    priority: c.priority,
    category: c.category,
    author: c.author_name,
    fromClient: c.author_guest_id !== null,
    page: (c.pages as unknown as { url: string } | null)?.url ?? null,
    element: (c.anchor as { selector?: string } | null)?.selector ?? null,
    url: link,
  };

  let text: string;
  let extra: Record<string, unknown> = {};
  if (job.event === "comment.created") text = `New comment ${ref} from ${c.author_name}${comment.fromClient ? " (client)" : ""}: ${quote}`;
  else if (job.event === "comment.status") {
    const to = String(job.meta?.to ?? c.status).replace("_", " ");
    extra = { from: job.meta?.from ?? null, to: job.meta?.to ?? c.status };
    text = `${job.actor ?? "Someone"} moved ${ref} to ${to}: ${quote}`;
  } else if (job.event === "reply.created") {
    const { data: reply } = await admin.from("replies").select("body, author_name").eq("id", String(job.meta?.reply_id ?? "")).maybeSingle();
    extra = { reply: reply ? { author: reply.author_name, body: reply.body } : null };
    text = `${job.actor ?? "Someone"} replied on ${ref}: "${clip(reply?.body ?? "", 140)}"`;
  } else if (job.event === "client.approved") text = `${job.actor ?? "The client"} confirmed the fix for ${ref}: ${quote}`;
  else if (job.event === "client.rejected") text = `${job.actor ?? "The client"} says ${ref} isn't right yet: ${quote}`;
  else {
    const triage = TriageSchema.safeParse(c.triage).data ?? null;
    const flags = triageInsights(triage, c.priority as Priority).map((i) => i.kind);
    extra = { flags, question: triage?.clarificationQuestion ?? null };
    const why = { clarify: "too vague to act on", duplicate: "looks like a duplicate", priority: "priority looks wrong", scope: "looks like new work" };
    text = `${ref} needs a decision (${flags.map((f) => why[f]).join(", ") || "flagged by AI"}): ${quote}`;
  }
  return { hook, body: { ...base, comment, ...extra, text: `${text}\n${link}` } };
}

/** Deliver one queued event. Throws on failure so the job queue retries with backoff. */
export async function deliverWebhook(job: Job): Promise<void> {
  const built = await buildPayload(job);
  if (!built) return;
  const { hook, body } = built;
  const admin = supabaseAdmin();
  const record = (status: number | null, error: string | null) =>
    admin.from("webhooks").update({ last_status: status, last_error: error, last_delivered_at: new Date().toISOString() }).eq("id", hook.id);

  const problem = webhookUrlProblem(hook.url);
  if (problem) {
    await record(null, problem);
    return; // retrying a refused address would never succeed
  }
  const json = JSON.stringify(body);
  let res: Response;
  try {
    res = await fetch(hook.url, {
      method: "POST",
      redirect: "manual", // a redirect could lead somewhere the check above would have refused
      signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/json", "user-agent": "Basenine-Feedback/1", "x-basenine-event": job.event, "x-basenine-signature": sign(hook.secret, json) },
      body: json,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "request failed";
    await record(null, message.slice(0, 200));
    throw new Error(`webhook ${hook.id}: ${message}`);
  }
  await record(res.status, res.ok ? null : `HTTP ${res.status}`);
  if (!res.ok) throw new Error(`webhook ${hook.id}: HTTP ${res.status}`);
}
