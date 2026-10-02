import { replyToFeedback } from "@/lib/api/feedback";
import { apiRoute, readJson } from "@/lib/api/route";

/** POST { "body": "…" } — replies as the token's owner; the comment's author is notified. */
export const POST = apiRoute<{ id: string }>(async (user, req, { id }) => ({
  reply: await replyToFeedback(user, id, (await readJson(req))),
}));
