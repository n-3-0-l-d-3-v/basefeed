import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { WIDGET_ATTACHMENT } from "@/lib/comments";
import { HttpError, preflight, widgetRoute } from "@/lib/widget/route";

export const OPTIONS = preflight;

/**
 * A file for a comment, sent as the raw request body (its type in Content-Type, its name in ?name=).
 * Clients and the team can both attach: a screenshot of what they mean is often the whole message.
 */
export const POST = widgetRoute<{ id: string }>(async ({ req, claims, project, admin }, { id }) => {
  if (!z.uuid().safeParse(id).success) throw new HttpError(404, "Comment not found");
  const mime = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const ext = WIDGET_ATTACHMENT.types[mime];
  if (!ext) throw new HttpError(415, "Attach an image (PNG, JPG, WebP, GIF) or a PDF");
  if (Number(req.headers.get("content-length") ?? 0) > WIDGET_ATTACHMENT.maxBytes) throw new HttpError(413, "Files can be up to 4 MB");
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length === 0) throw new HttpError(400, "The file is empty");
  if (bytes.length > WIDGET_ATTACHMENT.maxBytes) throw new HttpError(413, "Files can be up to 4 MB");

  const { data: comment } = await admin.from("comments").select("id").eq("id", id).eq("project_id", project.id).maybeSingle();
  if (!comment) throw new HttpError(404, "Comment not found");

  const name = (req.nextUrl.searchParams.get("name") ?? "").replace(/[\\/\u0000-\u001f]/g, "").trim().slice(0, 200) || `file.${ext}`;
  const path = `${project.id}/${id}/${randomUUID()}.${ext}`;
  const { error: upload } = await admin.storage.from("attachments").upload(path, bytes, { contentType: mime });
  if (upload) throw upload;
  const { data: row, error } = await admin
    .from("attachments")
    .insert({ comment_id: id, project_id: project.id, path, name, mime, size: bytes.length, created_by: claims.kind === "member" ? claims.sub : null })
    .select("id, name, mime")
    .single();
  if (error) {
    await admin.storage.from("attachments").remove([path]);
    throw error;
  }
  const { data: signed } = await admin.storage.from("attachments").createSignedUrl(path, 6 * 3600);
  return NextResponse.json({ attachment: { ...row, url: signed?.signedUrl ?? null } }, { status: 201 });
});
