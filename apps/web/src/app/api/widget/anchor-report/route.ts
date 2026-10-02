import { AnchorReportSchema } from "@bn/shared";
import { preflight, readJson, requireMember, widgetRoute } from "@/lib/widget/route";

export const OPTIONS = preflight;

/**
 * Team members' browsers report, for each comment on the page they're viewing, whether its
 * element is still there and what changed since the comment. This is what powers "likely fixed".
 */
export const POST = widgetRoute(async (ctx) => {
  requireMember(ctx);
  const { reports } = AnchorReportSchema.parse(await readJson(ctx.req));
  const checkedAt = new Date().toISOString();
  for (let i = 0; i < reports.length; i += 20) {
    await Promise.all(
      reports.slice(i, i + 20).map((r) =>
        ctx.admin
          .from("comments")
          .update({
            anchor_state: r.state,
            change_summary: { comparable: r.comparable, changes: r.changes, checkedAt },
            checked_at: checkedAt,
          })
          .eq("id", r.id)
          .eq("project_id", ctx.project.id)
          .eq("anchor->>key", r.anchorKey)
          .eq("anchor->>digest", r.anchorDigest),
      ),
    );
  }
  return new Response(null, { status: 204 });
});
