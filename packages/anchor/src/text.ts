export function collapse(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, " ");
}

export function norm(s: string): string {
  return collapse(s).trim().toLowerCase();
}

/** FNV-1a 32-bit, hex. Stable across browsers and Node. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Sørensen–Dice similarity over character bigrams, 0..1. */
export function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const n = grams.get(g);
    if (n) {
      overlap++;
      grams.set(g, n - 1);
    }
  }
  return (2 * overlap) / (a.length + b.length - 2);
}

export function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const sa = new Set(a);
  let inter = 0;
  for (const x of new Set(b)) if (sa.has(x)) inter++;
  return inter / (sa.size + new Set(b).size - inter);
}

const CONTEXT_COMPARE = 32;

export function tailMatch(current: string, stored: string): boolean {
  const a = norm(current);
  const b = norm(stored);
  return a.slice(-CONTEXT_COMPARE) === b.slice(-CONTEXT_COMPARE);
}

export function headMatch(current: string, stored: string): boolean {
  const a = norm(current);
  const b = norm(stored);
  return a.slice(0, CONTEXT_COMPARE) === b.slice(0, CONTEXT_COMPARE);
}
