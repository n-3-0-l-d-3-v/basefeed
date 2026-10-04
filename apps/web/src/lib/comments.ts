import type { AnchorInput, Json, SnapshotInput, WidgetAttachment, WidgetComment, WidgetReply } from "@bn/shared";
import { supabaseAdmin } from "./supabase/server";

type Admin = ReturnType<typeof supabaseAdmin>;

export const WIDGET_COMMENT_COLUMNS =
  "id, number, body, title, status, priority, author_name, author_user_id, author_guest_id, created_at, anchor, snapshot, anchor_state, change_summary, client_review" as const;

type Row = {
  id: string;
  number: number;
  body: string;
  title: string | null;
  status: WidgetComment["status"];
  priority: WidgetComment["priority"];
  author_name: string;
  author_user_id: string | null;
  author_guest_id: string | null;
  created_at: string;
  client_review: string | null;
  anchor: Json | null;
  snapshot: Json | null;
  anchor_state: string;
  change_summary: Json | null;
};

/** `viewer` is the widget session's user or guest id; author ids themselves never leave the server. */
export function toWidgetComment(
  { author_user_id, author_guest_id, ...row }: Row,
  replies: WidgetReply[],
  viewer: string,
  attachments: WidgetAttachment[] = [],
): WidgetComment {
  return {
    ...row,
    attachments,
    mine: viewer === author_user_id || viewer === author_guest_id,
    client_review: row.client_review as WidgetComment["client_review"],
    anchor: row.anchor as unknown as AnchorInput | null,
    snapshot: row.snapshot as unknown as SnapshotInput | null,
    anchor_state: row.anchor_state as WidgetComment["anchor_state"],
    change_summary: row.change_summary as unknown as WidgetComment["change_summary"],
    replies,
  };
}

/** Files clients and the team may attach from the site. Smaller than the dashboard's limit: it travels through the API. */
export const WIDGET_ATTACHMENT = {
  maxBytes: 4 * 1024 * 1024,
  types: { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" } as Record<string, string>,
};

const LINK_SECONDS = 6 * 3600; // a review session, not forever

export async function attachmentsByComment(admin: Admin, ids: string[]): Promise<Map<string, WidgetAttachment[]>> {
  const map = new Map<string, WidgetAttachment[]>();
  if (ids.length === 0) return map;
  const { data, error } = await admin.from("attachments").select("id, comment_id, path, name, mime").in("comment_id", ids).order("created_at");
  if (error) throw error;
  if (data.length === 0) return map;
  const { data: signed } = await admin.storage.from("attachments").createSignedUrls(data.map((a) => a.path), LINK_SECONDS);
  data.forEach((a, i) => {
    const list = map.get(a.comment_id) ?? [];
    list.push({ id: a.id, name: a.name, mime: a.mime, url: signed?.[i]?.signedUrl ?? null });
    map.set(a.comment_id, list);
  });
  return map;
}

export async function repliesByComment(admin: Admin, ids: string[]): Promise<Map<string, WidgetReply[]>> {
  const map = new Map<string, WidgetReply[]>();
  if (ids.length === 0) return map;
  const { data, error } = await admin
    .from("replies")
    .select("id, comment_id, author_name, body, created_at")
    .in("comment_id", ids)
    .order("created_at");
  if (error) throw error;
  for (const r of data) {
    const list = map.get(r.comment_id) ?? [];
    list.push({ id: r.id, author_name: r.author_name, body: r.body, created_at: r.created_at });
    map.set(r.comment_id, list);
  }
  return map;
}

const DATA_URL = /^data:(image\/(png|jpeg|webp));base64,(.+)$/;

/** Screenshots live in a private bucket; the dashboard reads them through short-lived signed URLs. */
export async function storeScreenshot(admin: Admin, projectId: string, commentId: string, dataUrl: string): Promise<string | null> {
  const m = DATA_URL.exec(dataUrl);
  if (!m) return null;
  const [, mime, ext] = m;
  const bytes = Buffer.from(m[3]!, "base64");
  const path = `${projectId}/${commentId}.${ext === "jpeg" ? "jpg" : ext}`;
  const { error } = await admin.storage.from("screenshots").upload(path, bytes, { contentType: mime, upsert: true });
  if (error) {
    console.error("[screenshot] upload failed", error.message);
    return null;
  }
  await admin.from("comments").update({ screenshot_path: path }).eq("id", commentId);
  return path;
}
