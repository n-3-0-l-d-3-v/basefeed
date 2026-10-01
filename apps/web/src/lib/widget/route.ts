import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { supabaseAdmin } from "../supabase/server";
import { verifyWidgetToken, type WidgetClaims } from "./token";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface WidgetProject {
  id: string;
  name: string;
  workspace_id: string;
  allowed_origins: string[];
}

export interface WidgetContext {
  req: NextRequest;
  claims: WidgetClaims;
  project: WidgetProject;
  admin: ReturnType<typeof supabaseAdmin>;
}

const MAX_BODY_BYTES = 3_500_000;
const RATE_LIMIT = { hits: 300, windowSeconds: 60 };

function cors(res: Response, origin: string | null): Response {
  if (origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
  }
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/** Preflights carry no credentials; the real request is checked against the token's origin. */
export function preflight(req: NextRequest): Response {
  const res = new Response(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "authorization, content-type");
  res.headers.set("Access-Control-Max-Age", "600");
  return cors(res, req.headers.get("origin"));
}

async function authenticate(req: NextRequest): Promise<WidgetContext> {
  const origin = req.headers.get("origin");
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "Missing credentials");
  const claims = await verifyWidgetToken(token);
  if (!claims) throw new HttpError(401, "Invalid or expired session");
  if (!origin || origin !== claims.org) throw new HttpError(403, "This session belongs to a different site");

  const admin = supabaseAdmin();
  const { data: project } = await admin
    .from("projects")
    .select("id, name, workspace_id, allowed_origins, archived_at")
    .eq("id", claims.pid)
    .maybeSingle();
  if (!project || project.archived_at) throw new HttpError(401, "This project is no longer available");
  if (!project.allowed_origins.includes(claims.org)) throw new HttpError(403, "This site is not connected to the project");

  if (claims.kind === "member") {
    const { data } = await admin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", project.workspace_id)
      .eq("user_id", claims.sub)
      .maybeSingle();
    if (!data) throw new HttpError(401, "You no longer have access to this project");
  } else {
    const { data: guest } = await admin.from("guests").select("id").eq("id", claims.sub).eq("project_id", project.id).maybeSingle();
    if (!guest) throw new HttpError(401, "This guest session is no longer valid");
    if (claims.sl) {
      const { data: link } = await admin.from("share_links").select("revoked_at, expires_at").eq("id", claims.sl).maybeSingle();
      if (!link || link.revoked_at || (link.expires_at && Date.parse(link.expires_at) < Date.now()))
        throw new HttpError(401, "This share link has been turned off");
    }
  }

  const { data: allowed } = await admin.rpc("hit_rate_limit", {
    p_bucket: `widget:${claims.sub}`,
    p_limit: RATE_LIMIT.hits,
    p_window_seconds: RATE_LIMIT.windowSeconds,
  });
  if (allowed === false) throw new HttpError(429, "Too many requests. Slow down a little.");

  return { req, claims, project, admin };
}

export async function readJson(req: NextRequest): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) throw new HttpError(413, "Request too large");
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "Request too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

export function requireMember(ctx: WidgetContext) {
  if (ctx.claims.kind !== "member") throw new HttpError(403, "Only the project team can do that");
}

type Handler<P> = (ctx: WidgetContext, params: P) => Promise<Response>;

export function widgetRoute<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: NextRequest, route?: { params: Promise<P> }) => {
    const origin = req.headers.get("origin");
    try {
      const ctx = await authenticate(req);
      const params = (route ? await route.params : {}) as P;
      return cors(await handler(ctx, params), origin);
    } catch (e) {
      if (e instanceof HttpError) return cors(NextResponse.json({ error: e.message }, { status: e.status }), origin);
      if (e instanceof ZodError) return cors(NextResponse.json({ error: "Invalid request", issues: e.issues.slice(0, 5) }, { status: 400 }), origin);
      console.error("[widget-api]", e);
      return cors(NextResponse.json({ error: "Something went wrong on our side" }, { status: 500 }), origin);
    }
  };
}
