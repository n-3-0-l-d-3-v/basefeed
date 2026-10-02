import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateApiToken } from "@/lib/api/auth";
import { feedbackMcpServer } from "@/lib/api/mcp";
import { apiError } from "@/lib/api/route";

/**
 * Remote MCP server (Streamable HTTP, stateless) for Claude Code, Cursor and other MCP clients:
 *   claude mcp add --transport http basenine-feedback <APP_URL>/api/mcp --header "Authorization: Bearer bnf_…"
 */
async function handle(req: Request): Promise<Response> {
  try {
    const user = await authenticateApiToken(req);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await feedbackMcpServer(user).connect(transport);
    return await transport.handleRequest(req);
  } catch (e) {
    return apiError(e);
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
