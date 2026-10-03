import type { AnchorInput, ClientReview, CommentContext, Priority, Status, Triage } from "@bn/shared";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { currentUser } from "./supabase/server";

/** All loaders here run as the signed-in user, so row-level security decides what comes back. */

export const getSession = cache(async () => {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login");
  const [{ data: profile, error }, { data: memberships, error: membersError }] = await Promise.all([
    supabase.from("profiles").select("id, name, email").eq("id", user.id).maybeSingle(),
    supabase.from("workspace_members").select("role, workspace:workspaces(id, name)").eq("user_id", user.id).order("created_at"),
  ]);
  if (error ?? membersError) throw new Error(`Loading your account failed: ${(error ?? membersError)!.message}`);
  const workspaces = (memberships ?? []).flatMap((m) => (m.workspace ? [{ ...m.workspace, role: m.role }] : []));
  return { supabase, user, profile: profile ?? { id: user.id, name: user.email ?? "", email: user.email ?? "" }, workspaces };
});

export const getProject = cache(async (id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await getSession();
  const [{ data: project, error }, { data: pages, error: pagesError }] = await Promise.all([
    supabase.from("projects").select("id, name, site_url, public_key, allowed_origins, figma_url, workspace_id, created_at").eq("id", id).maybeSingle(),
    supabase.from("pages").select("id, url, title, kind, image_path, created_at").eq("project_id", id).order("created_at"),
  ]);
  // A failed query is an error, not "not found": never hide an outage behind a 404.
  if (error ?? pagesError) throw new Error(`Loading project failed: ${(error ?? pagesError)!.message}`);
  if (!project) notFound();
  return { project, pages: pages ?? [] };
});

export type DashboardComment = {
  id: string;
  number: number;
  page_id: string;
  body: string;
  title: string | null;
  category: string | null;
  status: Status;
  priority: Priority;
  author_name: string;
  author_user_id: string | null;
  author_guest_id: string | null;
  assignee_id: string | null;
  anchor: AnchorInput | null;
  pin: { x: number; y: number } | null;
  context: Partial<CommentContext>;
  screenshot_path: string | null;
  anchor_state: "attached" | "suggested" | "detached" | "unknown";
  change_summary: { comparable: boolean; changes: { field: string; from: string; to: string }[]; checkedAt?: string } | null;
  triage: (Triage & { model?: string; provider?: string; ms?: number; at?: string }) | null;
  triage_state: "pending" | "ready" | "accepted" | "dismissed" | "unavailable";
  client_review: ClientReview | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export const COMMENT_COLUMNS =
  "id, number, page_id, body, title, category, status, priority, author_name, author_user_id, author_guest_id, assignee_id, anchor, pin, context, screenshot_path, anchor_state, change_summary, triage, triage_state, client_review, created_at, updated_at, resolved_at";

export async function getProjectComments(projectId: string): Promise<DashboardComment[]> {
  const { supabase } = await getSession();
  const { data, error } = await supabase.from("comments").select(COMMENT_COLUMNS).eq("project_id", projectId).order("number", { ascending: false });
  if (error) throw error;
  return data as unknown as DashboardComment[];
}

export async function getMembers(workspaceId: string) {
  const { supabase } = await getSession();
  const { data } = await supabase.from("workspace_members").select("user_id, role").eq("workspace_id", workspaceId);
  const ids = (data ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, name, email").in("id", ids) : { data: [] };
  return (data ?? []).map((m) => {
    const p = profiles?.find((x) => x.id === m.user_id);
    return { id: m.user_id, role: m.role, name: p?.name || p?.email || "Member", email: p?.email ?? "" };
  });
}

export type Member = Awaited<ReturnType<typeof getMembers>>[number];
