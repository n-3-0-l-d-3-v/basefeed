import { ReviewSchema } from "@bn/shared";
import { after } from "next/server";
import { z } from "zod";
import { drainJobs } from "@/lib/jobs";
import { HttpError, preflight, readJson, widgetRoute } from "@/lib/widget/route";

export const OPTIONS = preflight;

/** A client confirms the fix for their own resolved comment, or sends it back with a note. */
export const POST = widgetRoute<{ id: string }>(async ({ req, claims, project, admin }, { id }) => {
  if (claims.kind !== "guest") throw new HttpError(403, "Only the client who left the comment can confirm it");
  if (!z.uuid().safeParse(id).success) throw new HttpError(404, "Comment not found");
  const { approved, note } = ReviewSchema.parse(await readJson(req));
  const { error } = await admin.rpc("review_comment_as_guest", {
    p_comment: id,
    p_project: project.id,
    p_guest: claims.sub,
    p_approved: approved,
    p_note: note ?? undefined,
  });
  if (error?.code === "P0002") throw new HttpError(409, "This comment isn't waiting for your confirmation");
  if (error) throw error;
  after(() => drainJobs()); // tells the team when a fix was sent back
  return new Response(null, { status: 204 });
});
