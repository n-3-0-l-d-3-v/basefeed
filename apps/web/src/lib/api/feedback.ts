import { StatusSchema } from "@bn/shared";
import { after } from "next/server";
import { z } from "zod";
import { COMMENT_COLUMNS, type DashboardComment } from "../data";
import { commentToMarkdown } from "../export";
import { drainJobs } from "../jobs";
import { supabaseAdmin } from "../supabase/server";
import { HttpError } from "../widget/route";
import type { ApiUser } from "./auth";

// One implementation behind both the REST API (/api/v1) and the MCP server (/api/mcp).

export const ListQuery = z.object({
  project: z.uuid().optional().describe("Only this project (id from a previous result). Default: every project you can access"),
  status: z
    .enum(["unresolved", "open", "in_progress", "resolved", "all"])
    .default("unresolved")
    .describe("unresolved = open + in progress (default)"),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const ReplyBody = z.object({ body: z.string().trim().min(1).max(5000) });
export const StatusBody = z.object({ status: StatusSchema });

const Id = z.uuid();

export async function listFeedback(user: ApiUser, query: unknown) {
  const q = ListQuery.parse(query);
  if (q.project && !user.projects.has(q.project)) throw new HttpError(404, "Project not found");
  const projectIds = q.project ? [q.project] : [...user.projects.keys()];
  if (projectIds.length === 0) return [];

  let rows = supabaseAdmin()
    .from("comments")
    .select("id, number, project_id, title, body, status, priority, category, author_name, anchor_state, created_at, page:pages(url, title)")
    .in("project_id", projectIds);
  if (q.status === "unresolved") rows = rows.neq("status", "resolved");
  else if (q.status !== "all") rows = rows.eq("status", q.status);
  const { data, error } = await rows.order("created_at", { ascending: false }).limit(q.limit);
  if (error) throw error;

  return data.map((c) => ({
    id: c.id,
    number: c.number,
    project: user.projects.get(c.project_id)!,
    page: c.page?.url ?? null,
    summary: c.title ?? firstLine(c.body),
    status: c.status,
    priority: c.priority,
    category: c.category,
    author: c.author_name,
    elementRemoved: c.anchor_state === "detached",
    createdAt: c.created_at,
  }));
}

/** The comment is visible only if its project is one of the caller's; otherwise it doesn't exist. */
async function commentFor(user: ApiUser, id: string) {
  if (!Id.safeParse(id).success) throw new HttpError(404, "Feedback not found");
  const { data } = await supabaseAdmin().from("comments").select(`${COMMENT_COLUMNS}, project_id`).eq("id", id).maybeSingle();
  if (!data || !user.projects.has(data.project_id)) throw new HttpError(404, "Feedback not found");
  return data as unknown as DashboardComment & { project_id: string };
}

export async function getFeedback(user: ApiUser, id: string) {
  const c = await commentFor(user, id);
  const admin = supabaseAdmin();
  const [{ data: page }, { data: replies }] = await Promise.all([
    admin.from("pages").select("url, kind").eq("id", c.page_id).single(),
    admin.from("replies").select("id, author_name, body, created_at").eq("comment_id", c.id).order("created_at"),
  ]);
  const pageUrl = page?.kind === "image" ? "(uploaded design image)" : (page?.url ?? "");
  return {
    id: c.id,
    number: c.number,
    project: user.projects.get(c.project_id)!,
    page: pageUrl,
    status: c.status,
    priority: c.priority,
    category: c.category,
    author: c.author_name,
    body: c.body,
    task: c.triage && c.triage_state !== "dismissed" ? c.triage.task : null,
    element: c.anchor ? { selector: c.anchor.selector, classes: c.anchor.classes, removed: c.anchor_state === "detached" } : null,
    changesSinceComment: c.change_summary?.changes ?? [],
    replies: (replies ?? []).map((r) => ({ author: r.author_name, body: r.body, createdAt: r.created_at })),
    createdAt: c.created_at,
    /** Same hand-off the dashboard's "Copy for AI agent" button produces. */
    markdown: commentToMarkdown(c, pageUrl),
  };
}

export async function replyToFeedback(user: ApiUser, id: string, input: unknown) {
  const { body } = ReplyBody.parse(input);
  const c = await commentFor(user, id);
  const { data, error } = await supabaseAdmin()
    .from("replies")
    .insert({ comment_id: c.id, project_id: c.project_id, author_user_id: user.id, author_name: user.name, body })
    .select("id, author_name, body, created_at")
    .single();
  if (error) throw error;
  after(() => drainJobs()); // the reply notification queued by the database
  return { id: data.id, author: data.author_name, body: data.body, createdAt: data.created_at };
}

export async function setFeedbackStatus(user: ApiUser, id: string, input: unknown) {
  const { status } = StatusBody.parse(input);
  const c = await commentFor(user, id);
  // Same path as the widget, so the activity log attributes the change to the token's owner.
  const { error } = await supabaseAdmin().rpc("update_comment_as", {
    p_comment: c.id,
    p_project: c.project_id,
    p_actor: user.id,
    p_actor_name: user.name,
    p_patch: { status },
  });
  if (error) throw error;
  return { id: c.id, number: c.number, status };
}

function firstLine(s: string) {
  const l = s.split("\n")[0] ?? "";
  return l.length > 120 ? `${l.slice(0, 119)}…` : l;
}
