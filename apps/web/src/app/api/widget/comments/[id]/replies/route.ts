import { CreateReplySchema } from "@bn/shared";
import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, preflight, readJson, widgetRoute } from "@/lib/widget/route";

export const OPTIONS = preflight;

export const POST = widgetRoute<{ id: string }>(async ({ req, claims, project, admin }, { id }) => {
  if (!z.uuid().safeParse(id).success) throw new HttpError(404, "Comment not found");
  const { body } = CreateReplySchema.parse(await readJson(req));
  const { data: comment } = await admin.from("comments").select("id").eq("id", id).eq("project_id", project.id).maybeSingle();
  if (!comment) throw new HttpError(404, "Comment not found");

  const { data: reply, error } = await admin
    .from("replies")
    .insert({
      comment_id: id,
      project_id: project.id,
      author_user_id: claims.kind === "member" ? claims.sub : null,
      author_guest_id: claims.kind === "guest" ? claims.sub : null,
      author_name: claims.name,
      body,
    })
    .select("id, author_name, body, created_at")
    .single();
  if (error) throw error;
  return NextResponse.json({ reply }, { status: 201 });
});
