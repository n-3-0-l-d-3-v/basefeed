import { getFeedback, setFeedbackStatus } from "@/lib/api/feedback";
import { apiRoute, readJson } from "@/lib/api/route";

export const GET = apiRoute<{ id: string }>(async (user, _req, { id }) => ({ feedback: await getFeedback(user, id) }));

/** PATCH { "status": "open" | "in_progress" | "resolved" } */
export const PATCH = apiRoute<{ id: string }>(async (user, req, { id }) => ({
  feedback: await setFeedbackStatus(user, id, (await readJson(req))),
}));
