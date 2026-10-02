import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { HttpError, readJson } from "../widget/route";
import { authenticateApiToken, type ApiUser } from "./auth";

export { readJson };

/** JSON error body for the public API; 401s tell clients how to authenticate. */
export function apiError(e: unknown): Response {
  if (e instanceof HttpError) {
    const headers: HeadersInit = e.status === 401 ? { "WWW-Authenticate": 'Bearer realm="basenine-feedback"' } : {};
    return NextResponse.json({ error: e.message }, { status: e.status, headers });
  }
  if (e instanceof ZodError)
    return NextResponse.json({ error: "Invalid request", issues: e.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  console.error("[api]", e);
  return NextResponse.json({ error: "Something went wrong on our side" }, { status: 500 });
}

type Handler<P> = (user: ApiUser, req: NextRequest, params: P) => Promise<unknown>;

/** REST v1: bearer token in, JSON out. Server-to-server only, so no CORS. */
export function apiRoute<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: NextRequest, route?: { params: Promise<P> }) => {
    try {
      const user = await authenticateApiToken(req);
      const body = await handler(user, req, (route ? await route.params : {}) as P);
      return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      return apiError(e);
    }
  };
}
