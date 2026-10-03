"use server";

import { CategorySchema, PrioritySchema, StatusSchema, TriageSchema } from "@bn/shared";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { COMMENT_COLUMNS, getSession, type DashboardComment } from "@/lib/data";
import { env } from "@/lib/env";
import { drainJobs, enqueueTriage } from "@/lib/jobs";
import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizePageUrl, originOf } from "@/lib/urls";
import { signWidgetToken } from "@/lib/widget/token";

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const fail = (error: string): Result<never> => ({ ok: false, error });
const Id = z.uuid();

async function projectFor(projectId: string) {
  const { supabase, user, profile } = await getSession();
  if (!Id.safeParse(projectId).success) return null;
  const { data } = await supabase.from("projects").select("id, workspace_id, allowed_origins, site_url").eq("id", projectId).maybeSingle();
  return data ? { supabase, user, profile, project: data } : null;
}

// ---------------------------------------------------------------- projects

const NewProject = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(80),
  siteUrl: z.url("Enter the full site URL, e.g. https://acme.webflow.io").refine((u) => /^https?:\/\//.test(u), "Use an http(s) URL."),
});

export async function createProject(_: unknown, form: FormData): Promise<Result | undefined> {
  const { supabase, user, workspaces } = await getSession();
  const parsed = NewProject.safeParse({ name: form.get("name"), siteUrl: String(form.get("siteUrl") ?? "").trim() });
  if (!parsed.success) return fail(parsed.error.issues[0]!.message);
  const wanted = String(form.get("workspaceId") ?? "");
  const workspace = workspaces.find((w) => w.id === wanted) ?? workspaces[0];
  if (!workspace) return fail("You don't belong to a workspace yet.");
  const url = normalizePageUrl(parsed.data.siteUrl)!;
  const { data: project, error } = await supabase
    .from("projects")
    .insert({ workspace_id: workspace.id, name: parsed.data.name, site_url: url, allowed_origins: [originOf(url)!], created_by: user.id })
    .select("id")
    .single();
  if (error) return fail("Couldn't create the project.");
  await supabase.from("pages").insert({ project_id: project.id, url, title: "Home" });
  redirect(`/p/${project.id}/settings?welcome=1`);
}

export async function updateProject(projectId: string, patch: { name?: string; figmaUrl?: string | null }): Promise<Result> {
  const ctx = await projectFor(projectId);
  if (!ctx) return fail("Project not found.");
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(80).optional(),
      figmaUrl: z.union([z.literal(""), z.null(), z.url().regex(/^https:\/\/(www\.)?figma\.com\//, "That isn't a figma.com link.")]).optional(),
    })
    .safeParse(patch);
  if (!parsed.success) return fail(parsed.error.issues[0]!.message);
  const { error } = await ctx.supabase
    .from("projects")
    .update({
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.figmaUrl !== undefined ? { figma_url: parsed.data.figmaUrl || null } : {}),
    })
    .eq("id", projectId);
  if (error) return fail("Couldn't save.");
  revalidatePath(`/p/${projectId}`, "layout");
  return ok(undefined);
}

export async function setOrigins(projectId: string, origins: string[]): Promise<Result<string[]>> {
  const ctx = await projectFor(projectId);
  if (!ctx) return fail("Project not found.");
  const clean = [...new Set(origins.map((o) => originOf(o.trim())).filter((o): o is string => !!o))];
  if (clean.length === 0) return fail("Keep at least one site connected.");
  if (clean.length > 20) return fail("At most 20 sites per project.");
  const { error } = await ctx.supabase.from("projects").update({ allowed_origins: clean }).eq("id", projectId);
  if (error) return fail("Couldn't save.");
  revalidatePath(`/p/${projectId}`, "layout");
  return ok(clean);
}

// ---------------------------------------------------------------- pages

export async function addPage(projectId: string, rawUrl: string, title: string): Promise<Result<{ id: string; url: string }>> {
  const ctx = await projectFor(projectId);
  if (!ctx) return fail("Project not found.");
  const url = normalizePageUrl(rawUrl.trim());
  if (!url) return fail("Enter a full http(s) URL.");
  const origin = originOf(url)!;
  if (!ctx.project.allowed_origins.includes(origin)) {
    const { error } = await ctx.supabase.from("projects").update({ allowed_origins: [...ctx.project.allowed_origins, origin] }).eq("id", projectId);
    if (error) return fail("Couldn't connect that site.");
  }
  const { data, error } = await ctx.supabase
    .from("pages")
    .upsert({ project_id: projectId, url, title: title.trim().slice(0, 160) || new URL(url).pathname }, { onConflict: "project_id,url" })
    .select("id, url")
    .single();
  if (error) return fail("Couldn't add the page.");
  revalidatePath(`/p/${projectId}`);
  return ok(data);
}

/** The browser uploads straight to private storage (RLS-checked); this records the page. */
export async function addImagePage(projectId: string, path: string, title: string): Promise<Result<{ id: string }>> {
  const ctx = await projectFor(projectId);
  if (!ctx) return fail("Project not found.");
  if (!new RegExp(`^${projectId}/[0-9a-f-]{36}\\.(png|jpe?g|webp)$`).test(path)) return fail("Upload the image first.");
  const { data, error } = await ctx.supabase
    .from("pages")
    .insert({ project_id: projectId, kind: "image", url: `image:${path}`, image_path: path, title: title.trim().slice(0, 160) || "Design" })
    .select("id")
    .single();
  if (error) return fail("Couldn't add the image.");
  revalidatePath(`/p/${projectId}`);
  return ok(data);
}

export async function imageUrl(path: string): Promise<string | null> {
  const { supabase } = await getSession();
  const { data } = await supabase.storage.from("page-images").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

const ImageComment = z.object({
  body: z.string().trim().min(1).max(5000),
  priority: PrioritySchema,
  pin: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
});

export async function createImageComment(projectId: string, pageId: string, input: z.input<typeof ImageComment>): Promise<Result<DashboardComment>> {
  const ctx = await projectFor(projectId);
  const parsed = ImageComment.safeParse(input);
  if (!ctx || !parsed.success || !Id.safeParse(pageId).success) return fail("Write a comment first.");
  const { data, error } = await ctx.supabase
    .from("comments")
    .insert({
      project_id: projectId,
      page_id: pageId,
      author_user_id: ctx.user.id,
      author_name: ctx.profile.name || "Team",
      body: parsed.data.body,
      priority: parsed.data.priority,
      pin: parsed.data.pin,
      context: { kind: "image" },
    })
    .select(COMMENT_COLUMNS)
    .single();
  if (error) return fail("Couldn't save the comment.");
  await enqueueTriage(data.id);
  after(() => drainJobs());
  return ok(data as unknown as DashboardComment);
}

export async function removePage(projectId: string, pageId: string): Promise<Result> {
  const ctx = await projectFor(projectId);
  if (!ctx || !Id.safeParse(pageId).success) return fail("Page not found.");
  const { error } = await ctx.supabase.from("pages").delete().eq("id", pageId).eq("project_id", projectId);
  if (error) return fail("Couldn't remove the page.");
  revalidatePath(`/p/${projectId}`);
  return ok(undefined);
}

// ---------------------------------------------------------------- share links (guest commenting)

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createShareLink(projectId: string, label: string, days: number | null): Promise<Result<{ url: string }>> {
  const ctx = await projectFor(projectId);
  if (!ctx) return fail("Project not found.");
  const token = randomBytes(24).toString("base64url");
  const expires = days ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
  const { error } = await ctx.supabase.from("share_links").insert({
    project_id: projectId,
    token_hash: hashToken(token),
    label: label.trim().slice(0, 80),
    created_by: ctx.user.id,
    expires_at: expires,
  });
  if (error) return fail("Couldn't create the link.");
  revalidatePath(`/p/${projectId}/settings`);
  return ok({ url: `${env().APP_URL}/s/${token}` });
}

export async function revokeShareLink(projectId: string, linkId: string): Promise<Result> {
  const ctx = await projectFor(projectId);
  if (!ctx || !Id.safeParse(linkId).success) return fail("Link not found.");
  const { error } = await ctx.supabase.from("share_links").update({ revoked_at: new Date().toISOString() }).eq("id", linkId).eq("project_id", projectId);
  if (error) return fail("Couldn't turn the link off.");
  revalidatePath(`/p/${projectId}/settings`);
  return ok(undefined);
}

// ---------------------------------------------------------------- comments

const Patch = z
  .object({
    status: StatusSchema,
    priority: PrioritySchema,
    category: CategorySchema.nullable(),
    title: z.string().trim().max(120).nullable(),
    assignee_id: z.uuid().nullable(),
  })
  .partial();

export async function updateComment(commentId: string, patch: z.input<typeof Patch>): Promise<Result> {
  const { supabase } = await getSession();
  const parsed = Patch.safeParse(patch);
  if (!parsed.success || !Id.safeParse(commentId).success) return fail("Invalid change.");
  const { data, error } = await supabase.from("comments").update(parsed.data).eq("id", commentId).select("id");
  if (error || !data?.length) return fail("Couldn't update the comment.");
  // Assigning someone, or resolving a client's comment, queues an email.
  if (parsed.data.assignee_id || parsed.data.status === "resolved") after(() => drainJobs());
  return ok(undefined);
}

export type TriageDecision = "ask" | "duplicate" | "priority" | "noted" | "dismiss";

/**
 * A person's answer to what triage flagged, in one click: send the clarifying question to the author,
 * close the comment as a duplicate, take the suggested priority, acknowledge a new-work flag, or dismiss.
 */
export async function decideTriage(
  commentId: string,
  decision: TriageDecision,
): Promise<Result<{ patch: Partial<DashboardComment>; reply: { id: string; author_name: string; body: string; created_at: string } | null }>> {
  const { supabase, user, profile } = await getSession();
  if (!Id.safeParse(commentId).success) return fail("Comment not found.");
  const { data: c } = await supabase.from("comments").select("project_id, triage, triage_state").eq("id", commentId).maybeSingle();
  if (!c || c.triage_state !== "ready") return fail("There is nothing to decide on this comment.");
  const t = TriageSchema.safeParse(c.triage).data;
  if (!t) return fail("There is nothing to decide on this comment.");

  let text: string | null = null;
  let patch: Partial<DashboardComment> = { triage_state: "accepted" };
  if (decision === "ask") {
    if (!t.clarificationQuestion) return fail("There is no question to ask.");
    text = t.clarificationQuestion;
  } else if (decision === "duplicate") {
    if (!t.duplicateOf) return fail("No duplicate was found.");
    text = `Same request as #${t.duplicateOf}, so we're tracking it there.`;
    patch = { ...patch, status: "resolved" };
  } else if (decision === "priority") {
    patch = { ...patch, priority: t.priority };
  } else if (decision === "dismiss") {
    patch = { triage_state: "dismissed" };
  }

  let reply = null;
  if (text) {
    const { data, error } = await supabase
      .from("replies")
      .insert({ comment_id: commentId, project_id: c.project_id, author_user_id: user.id, author_name: profile.name || "Team", body: text })
      .select("id, author_name, body, created_at")
      .single();
    if (error) return fail("Couldn't send the reply.");
    reply = data;
  }
  const { error } = await supabase.from("comments").update(patch).eq("id", commentId);
  if (error) return fail("Couldn't apply that.");
  after(() => drainJobs());
  return ok({ patch, reply });
}

export async function retryTriage(commentId: string): Promise<Result> {
  const { supabase } = await getSession();
  if (!Id.safeParse(commentId).success) return fail("Comment not found.");
  const { data: visible } = await supabase.from("comments").select("id").eq("id", commentId).maybeSingle();
  if (!visible) return fail("Comment not found.");
  const admin = supabaseAdmin();
  await admin.from("jobs").delete().eq("idempotency_key", `triage:${commentId}`);
  await admin.from("comments").update({ triage_state: "pending", triage: null }).eq("id", commentId);
  const drain = await enqueueTriage(commentId);
  if (!drain) return fail("AI triage isn't configured for this deployment.");
  await drain();
  return ok(undefined);
}

export async function replyToComment(commentId: string, body: string): Promise<Result<{ id: string; author_name: string; body: string; created_at: string }>> {
  const { supabase, user, profile } = await getSession();
  const text = body.trim();
  if (!text || text.length > 5000 || !Id.safeParse(commentId).success) return fail("Write a reply first.");
  const { data: c } = await supabase.from("comments").select("project_id").eq("id", commentId).maybeSingle();
  if (!c) return fail("Comment not found.");
  const { data, error } = await supabase
    .from("replies")
    .insert({ comment_id: commentId, project_id: c.project_id, author_user_id: user.id, author_name: profile.name || "Team", body: text })
    .select("id, author_name, body, created_at")
    .single();
  if (error) return fail("Couldn't send the reply.");
  after(() => drainJobs());
  return ok(data);
}

export async function getComment(commentId: string): Promise<DashboardComment | null> {
  const { supabase } = await getSession();
  if (!Id.safeParse(commentId).success) return null;
  const { data } = await supabase.from("comments").select(COMMENT_COLUMNS).eq("id", commentId).maybeSingle();
  return (data as unknown as DashboardComment | null) ?? null;
}

export async function getThread(commentId: string) {
  const { supabase, user } = await getSession();
  if (!Id.safeParse(commentId).success) return { projectId: null, replies: [], activity: [], screenshotUrl: null, attachments: [] as Attachment[] };
  const [{ data: replies }, { data: activity }, { data: c }, { data: files }] = await Promise.all([
    supabase.from("replies").select("id, author_name, body, created_at").eq("comment_id", commentId).order("created_at"),
    supabase.from("activity").select("id, actor_name, action, meta, created_at").eq("comment_id", commentId).order("created_at"),
    supabase.from("comments").select("project_id, screenshot_path").eq("id", commentId).maybeSingle(),
    supabase.from("attachments").select("id, path, name, mime, size, created_by").eq("comment_id", commentId).order("created_at"),
  ]);
  let screenshotUrl: string | null = null;
  if (c?.screenshot_path) {
    const { data } = await supabase.storage.from("screenshots").createSignedUrl(c.screenshot_path, 600);
    screenshotUrl = data?.signedUrl ?? null;
  }
  let attachments: Attachment[] = [];
  if (files?.length) {
    const { data: signed } = await supabase.storage.from("attachments").createSignedUrls(files.map((f) => f.path), 600);
    attachments = files.map((f, i) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, url: signed?.[i]?.signedUrl ?? null, mine: f.created_by === user.id }));
  }
  return { projectId: c?.project_id ?? null, replies: replies ?? [], activity: activity ?? [], screenshotUrl, attachments };
}

// ---------------------------------------------------------------- attachments

export type Attachment = { id: string; name: string; mime: string; size: number; url: string | null; mine: boolean };

/** The browser uploads straight to private storage (RLS-checked); this records the file on the comment. */
export async function addAttachment(commentId: string, path: string, name: string): Promise<Result<Attachment>> {
  const { supabase, user } = await getSession();
  if (!Id.safeParse(commentId).success) return fail("Comment not found.");
  const { data: c } = await supabase.from("comments").select("project_id").eq("id", commentId).maybeSingle();
  if (!c) return fail("Comment not found.");
  if (!new RegExp(`^${c.project_id}/${commentId}/[0-9a-f-]{36}\\.(png|jpg|webp|gif|pdf)$`).test(path)) return fail("Upload the file first.");
  // Size and type come from storage (which enforces the bucket's limits), not from the browser.
  const { data: obj } = await supabaseAdmin().storage.from("attachments").info(path);
  if (!obj?.size || !obj.contentType) return fail("Upload the file first.");
  const { data, error } = await supabase
    .from("attachments")
    .insert({ comment_id: commentId, project_id: c.project_id, path, name: name.trim().slice(0, 200) || "file", mime: obj.contentType, size: obj.size, created_by: user.id })
    .select("id, name, mime, size")
    .single();
  if (error) return fail("Couldn't attach the file.");
  const { data: signed } = await supabase.storage.from("attachments").createSignedUrl(path, 600);
  return ok({ ...data, url: signed?.signedUrl ?? null, mine: true });
}

export async function deleteAttachment(attachmentId: string): Promise<Result> {
  const { supabase } = await getSession();
  if (!Id.safeParse(attachmentId).success) return fail("File not found.");
  const { data, error } = await supabase.from("attachments").delete().eq("id", attachmentId).select("path");
  if (error || !data?.length) return fail("Only the person who added a file can remove it.");
  await supabaseAdmin().storage.from("attachments").remove(data.map((a) => a.path));
  return ok(undefined);
}

export async function deleteComment(commentId: string): Promise<Result> {
  const { supabase } = await getSession();
  if (!Id.safeParse(commentId).success) return fail("Comment not found.");
  const { data, error } = await supabase.from("comments").delete().eq("id", commentId).select("id");
  if (error || !data?.length) return fail("Only the author or a workspace admin can delete this.");
  return ok(undefined);
}

// ---------------------------------------------------------------- embedding the live site in the dashboard

export async function mintEmbedToken(projectId: string, pageUrl: string): Promise<Result<{ token: string }>> {
  const ctx = await projectFor(projectId);
  if (!ctx) return fail("Project not found.");
  const origin = originOf(pageUrl);
  if (!origin || !ctx.project.allowed_origins.includes(origin)) return fail("That site isn't connected to this project.");
  const token = await signWidgetToken({ sub: ctx.user.id, kind: "member", pid: projectId, org: origin, name: ctx.profile.name || "Team" });
  return ok({ token });
}
