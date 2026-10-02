"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/data";
import { env } from "@/lib/env";

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const fail = (error: string): Result<never> => ({ ok: false, error });
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function updateProfile(name: string): Promise<Result> {
  const { supabase, user } = await getSession();
  const parsed = z.string().trim().min(1, "Enter your name.").max(80).safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]!.message);
  const { error } = await supabase.from("profiles").update({ name: parsed.data }).eq("id", user.id);
  if (error) return fail("Couldn't save your name.");
  revalidatePath("/", "layout");
  return ok(undefined);
}

const Pref = z.enum(["new_comments", "assignments", "replies"]);

export async function setNotificationPref(key: z.infer<typeof Pref>, value: boolean): Promise<Result> {
  const { supabase, user } = await getSession();
  if (!Pref.safeParse(key).success) return fail("Unknown setting.");
  const row = { user_id: user.id, updated_at: new Date().toISOString(), ...({ [key]: value } as Partial<Record<z.infer<typeof Pref>, boolean>>) };
  const { error } = await supabase.from("notification_prefs").upsert(row, { onConflict: "user_id" });
  if (error) return fail("Couldn't save that setting.");
  return ok(undefined);
}

// ---------------------------------------------------------------- personal API tokens

export async function createApiToken(name: string): Promise<Result<{ token: string }>> {
  const { supabase, user } = await getSession();
  const parsed = z.string().trim().min(1, "Name the token, e.g. “Cursor on my laptop”.").max(60).safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]!.message);
  const token = `bnf_${randomBytes(24).toString("base64url")}`;
  const { error } = await supabase
    .from("api_tokens")
    .insert({ user_id: user.id, name: parsed.data, token_hash: sha256(token), prefix: token.slice(0, 12) });
  if (error) return fail("Couldn't create the token.");
  revalidatePath("/account");
  return ok({ token });
}

export async function revokeApiToken(id: string): Promise<Result> {
  const { supabase } = await getSession();
  if (!z.uuid().safeParse(id).success) return fail("Token not found.");
  const { error } = await supabase.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) return fail("Couldn't revoke the token.");
  revalidatePath("/account");
  return ok(undefined);
}

// ---------------------------------------------------------------- team

async function adminWorkspace() {
  const s = await getSession();
  const ws = s.workspaces.find((w) => w.role === "owner" || w.role === "admin");
  return ws ? { ...s, ws } : null;
}

export async function createInvite(role: "member" | "admin", days: number): Promise<Result<{ url: string }>> {
  const ctx = await adminWorkspace();
  if (!ctx) return fail("Only workspace owners and admins can invite people.");
  if (!["member", "admin"].includes(role) || ![1, 7, 30].includes(days)) return fail("Invalid invite.");
  const token = randomBytes(24).toString("base64url");
  const { error } = await ctx.supabase.from("workspace_invites").insert({
    workspace_id: ctx.ws.id,
    role,
    token_hash: sha256(token),
    created_by: ctx.user.id,
    expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
  });
  if (error) return fail("Couldn't create the invite.");
  revalidatePath("/account");
  return ok({ url: `${env().APP_URL}/invite/${token}` });
}

export async function revokeInvite(id: string): Promise<Result> {
  const ctx = await adminWorkspace();
  if (!ctx || !z.uuid().safeParse(id).success) return fail("Invite not found.");
  const { error } = await ctx.supabase.from("workspace_invites").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) return fail("Couldn't turn the invite off.");
  revalidatePath("/account");
  return ok(undefined);
}

export async function removeMember(userId: string): Promise<Result> {
  const ctx = await adminWorkspace();
  if (!ctx || !z.uuid().safeParse(userId).success) return fail("Member not found.");
  if (userId === ctx.user.id) return fail("You can't remove yourself.");
  const { data, error } = await ctx.supabase.from("workspace_members").delete().eq("workspace_id", ctx.ws.id).eq("user_id", userId).select("user_id");
  if (error || !data?.length) return fail("Owners can't be removed, and only admins can remove people.");
  revalidatePath("/account");
  return ok(undefined);
}

export async function acceptInvite(token: string): Promise<Result> {
  const { supabase } = await getSession();
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return fail("This invite link is malformed.");
  const { error } = await supabase.rpc("accept_invite", { p_token_hash: sha256(token) });
  if (error) return fail("This invite has expired or been turned off. Ask for a new one.");
  revalidatePath("/", "layout");
  return ok(undefined);
}
