import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { env } from "../env";

const AUDIENCE = "bn-widget";
const TTL = "12h";

const ClaimsSchema = z.object({
  sub: z.uuid(),
  kind: z.enum(["member", "guest"]),
  pid: z.uuid(),
  org: z.url(),
  name: z.string().min(1).max(80),
  sl: z.uuid().optional(),
});

export type WidgetClaims = z.infer<typeof ClaimsSchema>;

const key = () => new TextEncoder().encode(env().WIDGET_TOKEN_SECRET);

/**
 * A widget token is scoped to one person, one project and one site origin. It is short-lived and
 * re-checked against the database on every request, so removing a member, revoking a share link or
 * disconnecting a site takes effect immediately rather than at expiry.
 */
export async function signWidgetToken(c: WidgetClaims): Promise<string> {
  const { sub, ...rest } = c;
  return new SignJWT(rest)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(sub)
    .setAudience(AUDIENCE)
    .setIssuer(env().APP_URL)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(key());
}

export async function verifyWidgetToken(token: string): Promise<WidgetClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { audience: AUDIENCE, issuer: env().APP_URL, algorithms: ["HS256"] });
    const parsed = ClaimsSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
