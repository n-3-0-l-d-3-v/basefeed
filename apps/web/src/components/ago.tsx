import { ago } from "@/lib/export";

/**
 * "3 minutes ago". The server and the browser each compute it a moment apart, and now and then
 * land on different sides of a boundary; that difference is expected, so React is told not to
 * treat it as a rendering mismatch (which would re-render the page and drop anything being typed).
 */
export function Ago({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {ago(iso)}
    </time>
  );
}
