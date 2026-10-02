import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { HttpError } from "../widget/route";
import type { ApiUser } from "./auth";
import { getFeedback, listFeedback, ListQuery, replyToFeedback, ReplyBody, setFeedbackStatus, StatusBody } from "./feedback";

const text = (t: string): CallToolResult => ({ content: [{ type: "text", text: t }] });

/** Expected failures (not found, bad input) go back to the model as tool errors it can act on. */
async function run(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return { ...text(e.message), isError: true };
    if (e instanceof z.ZodError) return { ...text(`Invalid input: ${e.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`), isError: true };
    throw e;
  }
}

const FeedbackId = { id: z.uuid().describe("Feedback id, from list_feedback") };

/** A fresh server per request: the transport is stateless and every call carries the user's token. */
export function feedbackMcpServer(user: ApiUser): McpServer {
  const server = new McpServer(
    { name: "basenine-feedback", version: "1.0.0" },
    {
      instructions:
        "Website feedback that clients and the team pinned to elements of live pages. Use list_feedback to find work, get_feedback for the element's selector, Webflow classes, the request and what changed since, then reply or set_status once the change is made.",
    },
  );

  server.registerTool(
    "list_feedback",
    {
      title: "List feedback",
      description: "List feedback comments across your projects, newest first. Unresolved (open + in progress) by default.",
      inputSchema: ListQuery.shape,
      annotations: { readOnlyHint: true },
    },
    (args) =>
      run(async () => {
        const items = await listFeedback(user, args);
        if (items.length === 0) return text("No feedback matches.");
        const lines = items.map(
          (f) =>
            `- #${f.number} [${f.status}, ${f.priority}${f.category ? `, ${f.category}` : ""}] ${f.summary} — ${f.project.name}${f.page ? ` · ${f.page}` : ""} · ${f.author}${f.elementRemoved ? " · element removed" : ""} · id: ${f.id}`,
        );
        return text(`${items.length} item${items.length === 1 ? "" : "s"}:\n${lines.join("\n")}`);
      }),
  );

  server.registerTool(
    "get_feedback",
    {
      title: "Get feedback",
      description: "Everything needed to act on one comment: page, element selector and Webflow classes, the request, the AI task, changes since, and the thread.",
      inputSchema: FeedbackId,
      annotations: { readOnlyHint: true },
    },
    ({ id }) =>
      run(async () => {
        const f = await getFeedback(user, id);
        const thread = f.replies.length ? `\n\n**Replies:**\n${f.replies.map((r) => `- ${r.author}: ${r.body}`).join("\n")}` : "";
        return text(`${f.markdown}${thread}\n\n_Project: ${f.project.name} · id: ${f.id}_`);
      }),
  );

  server.registerTool(
    "reply",
    {
      title: "Reply to feedback",
      description: "Post a reply on a comment as you. The author and the team are notified.",
      inputSchema: { ...FeedbackId, ...ReplyBody.shape },
    },
    ({ id, body }) =>
      run(async () => {
        await replyToFeedback(user, id, { body });
        return text("Reply posted.");
      }),
  );

  server.registerTool(
    "set_status",
    {
      title: "Set feedback status",
      description: "Move a comment to open, in_progress or resolved. Resolve only once the change is live.",
      inputSchema: { ...FeedbackId, ...StatusBody.shape },
      annotations: { idempotentHint: true },
    },
    ({ id, status }) =>
      run(async () => {
        const r = await setFeedbackStatus(user, id, { status });
        return text(`#${r.number} is now ${r.status.replace("_", " ")}.`);
      }),
  );

  return server;
}
