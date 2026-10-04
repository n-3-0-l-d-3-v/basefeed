const PRIVATE_V4 = /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * Where a webhook may point. The server makes this request, so it must not be usable to reach
 * things only the server can see: HTTPS only, and no loopback, link-local or private addresses.
 * A local app (APP_URL on localhost) may call localhost, for development and tests.
 */
export function urlProblem(raw: string, appUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Enter a full URL, starting with https://";
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1";
  if (local && /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(appUrl)) return null;
  if (url.protocol !== "https:") return "Webhook URLs must use https://";
  if (local || host.endsWith(".local") || host.endsWith(".internal") || PRIVATE_V4.test(host) || host === "::1" || /^(fc|fd|fe80)/.test(host))
    return "That address is private; webhooks must point at a public URL";
  return null;
}
