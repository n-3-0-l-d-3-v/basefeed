/**
 * Pages are identified by origin + path. Query strings and fragments are dropped: they carry
 * tracking/feedback flags, not different pages (Webflow pages and CMS items are path-based).
 */
export function normalizePageUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.origin}${path}`;
  } catch {
    return null;
  }
}

export function originOf(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** URL the dashboard frames: the real page with the widget told it's embedded. */
export function embedUrl(pageUrl: string): string {
  const u = new URL(pageUrl);
  u.searchParams.set("bn_feedback", "embed");
  return u.href;
}
