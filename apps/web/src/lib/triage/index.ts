import type { AnchorInput, CommentContext, Json } from "@bn/shared";
import { env } from "../env";
import { supabaseAdmin } from "../supabase/server";
import { AnthropicTriage } from "./anthropic";
import { GeminiTriage } from "./gemini";
import type { TriageInput, TriageProvider } from "./types";

let provider: TriageProvider | null | undefined;

export function triageProvider(): TriageProvider | null {
  if (provider !== undefined) return provider;
  const e = env();
  if (e.AI_PROVIDER === "anthropic" && e.ANTHROPIC_API_KEY) provider = new AnthropicTriage(e.ANTHROPIC_API_KEY, e.AI_MODEL || undefined);
  else if (e.AI_PROVIDER === "gemini" && e.GEMINI_API_KEY) provider = new GeminiTriage(e.GEMINI_API_KEY, e.AI_MODEL || undefined);
  else provider = null;
  return provider;
}

/** Testing hook: inject a fake provider. */
export function setTriageProvider(p: TriageProvider | null) {
  provider = p;
}

const MEDIA: Record<string, NonNullable<TriageInput["screenshot"]>["mediaType"]> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function buildTriageInput(commentId: string): Promise<TriageInput | null> {
  const admin = supabaseAdmin();
  const { data: c } = await admin
    .from("comments")
    .select("id, page_id, body, priority, anchor, context, screenshot_path, author_guest_id, number")
    .eq("id", commentId)
    .maybeSingle();
  if (!c) return null;

  const anchor = c.anchor as unknown as AnchorInput | null;
  const ctx = c.context as unknown as Partial<CommentContext>;
  const [{ data: page }, { data: open }] = await Promise.all([
    admin.from("pages").select("url, title").eq("id", c.page_id).single(),
    admin.from("comments").select("number, title, body").eq("page_id", c.page_id).neq("status", "resolved").neq("id", c.id).order("number").limit(30),
  ]);

  let screenshot: TriageInput["screenshot"] = null;
  if (c.screenshot_path) {
    const { data: blob } = await admin.storage.from("screenshots").download(c.screenshot_path);
    const mediaType = MEDIA[c.screenshot_path.split(".").pop() ?? ""];
    if (blob && mediaType) screenshot = { mediaType, base64: Buffer.from(await blob.arrayBuffer()).toString("base64") };
  }

  return {
    comment: { body: c.body, priority: c.priority, authorKind: c.author_guest_id ? "client" : "team" },
    element: {
      selector: anchor?.selector ?? "(image page pin)",
      tag: anchor?.tag ?? "",
      classes: anchor?.classes ?? ctx.elementClasses ?? [],
      excerpt: anchor?.excerpt ?? "",
    },
    page: {
      url: page?.url ?? ctx.url ?? "",
      title: page?.title ?? ctx.title ?? "",
      breakpoint: ctx.breakpoint ?? "desktop",
      viewportWidth: ctx.viewport?.w ?? 0,
      device: ctx.device ?? "desktop",
    },
    openComments: (open ?? []).map((o) => ({ number: o.number, summary: (o.title ?? o.body).slice(0, 160) })),
    screenshot,
  };
}

export async function runTriage(commentId: string) {
  const p = triageProvider();
  const admin = supabaseAdmin();
  if (!p) {
    await admin.from("comments").update({ triage_state: "unavailable" }).eq("id", commentId);
    return;
  }
  const input = await buildTriageInput(commentId);
  if (!input) return;
  const started = Date.now();
  const result = await p.triage(input);
  await admin
    .from("comments")
    .update({
      triage: { ...result, provider: p.name, ms: Date.now() - started, at: new Date().toISOString() } as unknown as Json,
      triage_state: "ready",
    })
    .eq("id", commentId)
    .eq("triage_state", "pending");
}
