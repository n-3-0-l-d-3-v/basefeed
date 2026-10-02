import type { ReactNode } from "react";

const URL_RE = /\bhttps?:\/\/[^\s<>"]+/gi;
// Sentence punctuation right after a link belongs to the sentence, not the URL.
const TRAILING = /[.,!?;:)\]'"]+$/;
const LOOM_RE = /^https?:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/([0-9a-f]{32})(?:[/?#]|$)/i;

const urls = (text: string) => [...text.matchAll(URL_RE)].map((m) => ({ start: m.index, url: m[0].replace(TRAILING, "") }));

/** Plain text with http(s) links made clickable. Everything else stays text (React escapes it). */
export function Linkified({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const { start, url } of urls(text)) {
    out.push(text.slice(last, start));
    out.push(
      <a key={start} href={url} target="_blank" rel="noreferrer noopener" className="break-all underline decoration-line-strong underline-offset-2 hover:decoration-ink">
        {url}
      </a>,
    );
    last = start + url.length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

export function loomIds(text: string): string[] {
  const ids = urls(text).flatMap(({ url }) => LOOM_RE.exec(url)?.[1]?.toLowerCase() ?? []);
  return [...new Set(ids)].slice(0, 3);
}

/** Loom links in the text, played inline so nobody has to leave the thread to watch them. */
export function LoomEmbeds({ text }: { text: string }) {
  const ids = loomIds(text);
  if (!ids.length) return null;
  return ids.map((id) => (
    <iframe
      key={id}
      src={`https://www.loom.com/embed/${id}`}
      title="Loom video"
      loading="lazy"
      allowFullScreen
      sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
      referrerPolicy="strict-origin-when-cross-origin"
      className="aspect-video w-full rounded-lg bg-sunken ring-1 ring-line"
    />
  ));
}
