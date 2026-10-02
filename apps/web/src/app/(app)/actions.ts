"use server";

import { CategorySchema, PrioritySchema, StatusSchema } from "@bn/shared";
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
  if (parsed.data.assignee_id) after(() => drainJobs());
  return ok(undefined);
}

export async function applyTriage(commentId: string, accept: boolean): Promise<Result> {
  const { supabase } = await getSession();
  if (!Id.safeParse(commentId).success) return fail("Comment not found.");
  const { data: c } = await supabase.from("comments").select("triage, triage_state").eq("id", commentId).maybeSingle();
  if (!c || c.triage_state !== "ready") return fail("There is no suggestion to apply.");
  const t = c.triage as { title?: string; category?: string; priority?: string } | null;
  const update = accept
    ? {
        triage_state: "accepted",
        title: t?.title?.slice(0, 120) ?? null,
        category: CategorySchema.safeParse(t?.category).data ?? null,
        ...(PrioritySchema.safeParse(t?.priority).success ? { priority: t!.priority as z.infer<typeof PrioritySchema> } : {}),
      }
    : { triage_state: "dismissed" };
  const { error } = await supabase.from("comments").update(update).eq("id", commentId);
  if (error) return fail("Couldn't apply the suggestion.");
  return ok(undefined);
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
  const { supabase } = await getSession();
  if (!Id.safeParse(commentId).success) return { replies: [], activity: [], screenshotUrl: null };
  const [{ data: replies }, { data: activity }, { data: c }] = await Promise.all([
    supabase.from("replies").select("id, author_name, body, created_at").eq("comment_id", commentId).order("created_at"),
    supabase.from("activity").select("id, actor_name, action, meta, created_at").eq("comment_id", commentId).order("created_at"),
    supabase.from("comments").select("screenshot_path").eq("id", commentId).maybeSingle(),
  ]);
  let screenshotUrl: string | null = null;
  if (c?.screenshot_path) {
    const { data } = await supabase.storage.from("screenshots").createSignedUrl(c.screenshot_path, 600);
    screenshotUrl = data?.signedUrl ?? null;
  }
  return { replies: replies ?? [], activity: activity ?? [], screenshotUrl };
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
