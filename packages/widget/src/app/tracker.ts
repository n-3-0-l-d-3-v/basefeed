import { DocIndex, diffSnapshot, resolve, takeSnapshot, type Anchor, type Resolution } from "@bn/anchor";
import type { AnchorReport, WidgetComment } from "@bn/shared";

export interface Placed {
  comment: WidgetComment;
  resolution: Resolution | null;
  element: Element | null;
}

const MUTATION_DEBOUNCE_MS = 400;

/**
 * Keeps every comment on this page resolved against the live DOM. One index pass serves all
 * comments; it is rebuilt (debounced) only when the page actually changes.
 */
export class Tracker {
  private comments: WidgetComment[] = [];
  private placed: Placed[] = [];
  private readonly observer: MutationObserver;
  private timer: number | undefined;

  constructor(private readonly onChange: (placed: Placed[]) => void) {
    this.observer = new MutationObserver(() => {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.recompute(), MUTATION_DEBOUNCE_MS);
    });
  }

  start() {
    this.observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "src", "href", "alt"],
    });
  }

  stop() {
    this.observer.disconnect();
    window.clearTimeout(this.timer);
  }

  set(comments: WidgetComment[]) {
    this.comments = comments;
    this.recompute();
  }

  current(): Placed[] {
    return this.placed;
  }

  recompute() {
    const index = new DocIndex(document);
    this.placed = this.comments.map((comment) => {
      if (!comment.anchor) return { comment, resolution: null, element: null };
      const resolution = resolve(comment.anchor as Anchor, index);
      return { comment, resolution, element: resolution.status === "detached" ? null : resolution.element };
    });
    this.onChange(this.placed);
  }

  /** Anchor health + "what changed since this comment", only for comments whose stored state is stale. */
  reports(): AnchorReport["reports"] {
    const out: AnchorReport["reports"] = [];
    for (const p of this.placed) {
      const anchor = p.comment.anchor;
      if (!p.resolution || !p.comment.snapshot || !anchor) continue;
      const of = { id: p.comment.id, anchorKey: anchor.key, anchorDigest: anchor.digest };
      const state = p.resolution.status;
      const diff =
        p.element && state === "attached" ? diffSnapshot(p.comment.snapshot, takeSnapshot(p.element)) : { comparable: false, changes: [] };
      const stored = p.comment.change_summary;
      // Viewed at another breakpoint: styles can't be compared, so keep the last comparable result.
      if (!diff.comparable && stored) {
        if (p.comment.anchor_state !== state) out.push({ ...of, state, changes: stored.changes, comparable: stored.comparable });
        continue;
      }
      const same =
        p.comment.anchor_state === state &&
        JSON.stringify(stored?.changes ?? []) === JSON.stringify(diff.changes) &&
        (stored?.comparable ?? false) === diff.comparable;
      if (!same) out.push({ ...of, state, changes: diff.changes, comparable: diff.comparable });
    }
    return out;
  }
}
