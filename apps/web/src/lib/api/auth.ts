import { createHash } from "node:crypto";
import { after } from "next/server";
import { supabaseAdmin } from "../supabase/server";
import { HttpError } from "../widget/route";

/** Who is calling with a personal API token, and the projects they can reach right now. */
export interface ApiUser {
  id: string;
  name: string;
  tokenId: string;
  projects: Map<string, { id: string; name: string }>;
}

const RATE_LIMIT = { hits: 120, windowSeconds: 60 };
const TOKEN = /^bnf_[A-Za-z0-9_-]{32}$/;

/**
 * Personal tokens (`bnf_…`) are stored only as a SHA-256 hash. The service-role client is used, so
 * every query below scopes itself to `user.projects`: the workspaces the token's owner belongs to today.
 */
export async function authenticateApiToken(req: Request): Promise<ApiUser> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!TOKEN.test(token)) throw new HttpError(401, "Missing or malformed API token. Create one under Account → API tokens.");

  const admin = supabaseAdmin();
  const { data: row } = await admin
    .from("api_tokens")
    .select("id, user_id, last_used_at")
    .eq("token_hash", createHash("sha256").update(token).digest("hex"))
    .is("revoked_at", null)
    .maybeSingle();
  if (!row) throw new HttpError(401, "This API token is invalid or was revoked.");

  const { data: allowed } = await admin.rpc("hit_rate_limit", {
    p_bucket: `api:${row.id}`,
    p_limit: RATE_LIMIT.hits,
    p_window_seconds: RATE_LIMIT.windowSeconds,
  });
  if (allowed === false) throw new HttpError(429, "Too many requests. Try again in a minute.");

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    admin.from("profiles").select("name").eq("id", row.user_id).maybeSingle(),
    admin.from("workspace_members").select("workspace_id").eq("user_id", row.user_id),
  ]);
  const workspaces = (memberships ?? []).map((m) => m.workspace_id);
  const { data: projects } = workspaces.length
    ? await admin.from("projects").select("id, name").in("workspace_id", workspaces).is("archived_at", null)
    : { data: [] };

  // Coarse "last used" for the Account page; at most one write a minute per token.
  if (!row.last_used_at || Date.now() - Date.parse(row.last_used_at) > 60_000)
    after(async () => {
      await admin.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
    });

  return {
    id: row.user_id,
    name: profile?.name || "API",
    tokenId: row.id,
    projects: new Map((projects ?? []).map((p) => [p.id, p])),
  };
}
