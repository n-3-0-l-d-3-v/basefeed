import { listFeedback } from "@/lib/api/feedback";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/feedback?project=&status=unresolved|open|in_progress|resolved|all&limit= */
export const GET = apiRoute(async (user, req) => {
  const sp = req.nextUrl.searchParams;
  const query = { project: sp.get("project") ?? undefined, status: sp.get("status") ?? undefined, limit: sp.get("limit") ?? undefined };
  return { feedback: await listFeedback(user, query) };
});
