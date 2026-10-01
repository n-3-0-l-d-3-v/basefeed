import { breakpoint } from "@bn/anchor";
import type { CommentContext } from "@bn/shared";

const BROWSERS: [string, RegExp][] = [
  ["Edge", /Edg\/(\d+)/],
  ["Opera", /OPR\/(\d+)/],
  ["Firefox", /Firefox\/(\d+)/],
  ["Chrome", /Chrome\/(\d+)/],
  ["Safari", /Version\/(\d+).*Safari/],
];

export function detectBrowser(ua: string): string {
  for (const [name, re] of BROWSERS) {
    const m = re.exec(ua);
    if (m) return `${name} ${m[1]}`;
  }
  return "Unknown browser";
}

export function detectOS(ua: string): string {
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown OS";
}

export function detectDevice(width: number, ua: string): "desktop" | "tablet" | "mobile" {
  if (/iPad|Tablet/.test(ua) || (width >= 600 && width < 992 && /Mobi|Android/.test(ua))) return "tablet";
  if (/Mobi|iPhone|Android/.test(ua) || width < 600) return "mobile";
  return width < 992 ? "tablet" : "desktop";
}

export function pageContext(target: Element): CommentContext {
  const ua = navigator.userAgent;
  const w = window.innerWidth;
  return {
    url: location.href.split("#")[0]!,
    title: document.title.slice(0, 300),
    viewport: { w, h: window.innerHeight },
    dpr: Math.min(8, Math.max(0.5, window.devicePixelRatio || 1)),
    scroll: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) },
    breakpoint: breakpoint(w),
    browser: detectBrowser(ua),
    os: detectOS(ua),
    device: detectDevice(w, ua),
    userAgent: ua.slice(0, 512),
    elementClasses: Array.from(target.classList).slice(0, 40),
  };
}

/** Human label for an element, the way a Webflow developer would refer to it. */
export function describe(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const cls = Array.from(el.classList).filter((c) => !c.startsWith("w--"));
  return cls.length ? `${tag}.${cls.join(".")}` : tag;
}
