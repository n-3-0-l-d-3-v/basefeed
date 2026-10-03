import type { AnchorInput, Json, SnapshotInput, WidgetComment, WidgetReply } from "@bn/shared";
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
export function toWidgetComment({ author_user_id, author_guest_id, ...row }: Row, replies: WidgetReply[], viewer: string): WidgetComment {
  return {
    ...row,
    mine: viewer === author_user_id || viewer === author_guest_id,
    client_review: row.client_review as WidgetComment["client_review"],
    anchor: row.anchor as unknown as AnchorInput | null,
    snapshot: row.snapshot as unknown as SnapshotInput | null,
    anchor_state: row.anchor_state as WidgetComment["anchor_state"],
    change_summary: row.change_summary as unknown as WidgetComment["change_summary"],
    replies,
  };
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
