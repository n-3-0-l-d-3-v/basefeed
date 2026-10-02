import { AnchorSchema, StatusSchema, type Json } from "@bn/shared";
import { z } from "zod";
import { HttpError, preflight, readJson, requireMember, widgetRoute } from "@/lib/widget/route";

export const OPTIONS = preflight;

// Change the status, or re-pin a comment whose element changed or was removed.
const Body = z.union([z.object({ status: StatusSchema }).strict(), z.object({ anchor: AnchorSchema }).strict()]);

export const PATCH = widgetRoute<{ id: string }>(async (ctx, { id }) => {
  requireMember(ctx);
  if (!z.uuid().safeParse(id).success) throw new HttpError(404, "Comment not found");
  const patch = Body.parse(await readJson(ctx.req));
  const { error } = await ctx.admin.rpc("update_comment_as", {
    p_comment: id,
    p_project: ctx.project.id,
    p_actor: ctx.claims.sub,
    p_actor_name: ctx.claims.name,
    p_patch: patch as unknown as Json,
  });
  if (error?.code === "P0002") throw new HttpError(404, "Comment not found");
  if (error) throw error;
  return new Response(null, { status: 204 });
});
