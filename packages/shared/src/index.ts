import { z } from "zod";

export type { Database, Json } from "./database.types";

const shortText = (max: number) => z.string().max(max);

export const AnchorSchema = z.object({
  v: z.literal(1),
  key: shortText(400),
  tag: shortText(40),
  kind: z.enum(["leaf", "container"]),
  text: shortText(500),
  excerpt: shortText(200),
  classes: z.array(shortText(120)).max(40),
  attrs: z.record(shortText(40), shortText(1024)),
  digest: shortText(300),
  prefix: shortText(80),
  suffix: shortText(80),
  path: shortText(2000),
  parentSig: shortText(16),
  selector: shortText(2000),
  unique: z.boolean(),
  scope: z
    .object({ tag: shortText(40), textHash: shortText(16), rel: shortText(2000), prefix: shortText(80), suffix: shortText(80) })
    .nullable()
    .default(null),
  offset: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
});

export const SnapshotSchema = z.object({
  v: z.literal(1),
  viewportWidth: z.number().int().min(0).max(10000),
  text: shortText(500),
  src: shortText(2048).nullable(),
  size: z.object({ w: z.number().min(0).max(100000), h: z.number().min(0).max(100000) }),
  styles: z.record(shortText(40), shortText(300)),
});

export const ContextSchema = z.object({
  url: z.url().max(2048),
  title: shortText(300),
  viewport: z.object({ w: z.number().int().min(0).max(10000), h: z.number().int().min(0).max(10000) }),
  dpr: z.number().min(0.5).max(8),
  scroll: z.object({ x: z.number(), y: z.number() }),
  breakpoint: z.enum(["desktop", "tablet", "mobile-landscape", "mobile-portrait"]),
  browser: shortText(60),
  os: shortText(60),
  device: z.enum(["desktop", "tablet", "mobile"]),
  userAgent: shortText(512),
  elementClasses: z.array(shortText(120)).max(40),
});

export const PrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export const StatusSchema = z.enum(["open", "in_progress", "resolved"]);
export const CategorySchema = z.enum(["copy", "design", "layout", "bug", "content", "question", "other"]);

/** PNG/JPEG/WebP data URL, at most ~2.2 MB decoded. */
export const ScreenshotSchema = z
  .string()
  .max(3_000_000)
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/);

export const CreateCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  priority: PrioritySchema.default("medium"),
  anchor: AnchorSchema,
  snapshot: SnapshotSchema,
  context: ContextSchema,
  screenshot: ScreenshotSchema.optional(),
});

export type ClientReview = "pending" | "approved" | "rejected";
export const ReviewSchema = z.object({ approved: z.boolean(), note: z.string().trim().max(5000).optional() });

export const CreateReplySchema = z.object({ body: z.string().trim().min(1).max(5000) });

export const AnchorReportSchema = z.object({
  reports: z
    .array(
      z.object({
        id: z.uuid(),
        // Which anchor this was resolved against, so a report can't undo a re-pin that landed first.
        anchorKey: shortText(400),
        anchorDigest: shortText(300),
        state: z.enum(["attached", "suggested", "detached"]),
        changes: z.array(z.object({ field: shortText(40), from: shortText(300), to: shortText(300) })).max(40),
        comparable: z.boolean(),
      }),
    )
    .max(500),
});

export const GuestJoinSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().max(254),
});

export const TriageSchema = z.object({
  title: z.string().min(1).max(120).describe("Short imperative task title, e.g. 'Increase hero heading size on mobile'"),
  category: CategorySchema,
  priority: PrioritySchema,
  task: z.string().min(1).max(800).describe("Clear instruction for the person fixing it, naming the element and Webflow class"),
  needsClarification: z.boolean(),
  clarificationQuestion: z.string().max(300).nullable(),
  duplicateOf: z.number().int().positive().nullable().describe("Number of an existing open comment this duplicates, if any"),
  confidence: z.number().min(0).max(1),
  // Added later; defaults keep triage stored before they existed readable.
  /** Exact text replacement the author asked for, ready to paste. */
  change: z.object({ from: z.string().max(300), to: z.string().min(1).max(300) }).nullable().default(null),
  /** A tweak to what exists, or new work beyond it (a new section, page, feature, asset). */
  scope: z.enum(["tweak", "new_work"]).default("tweak"),
  /** One line explaining a changed priority or a new-work flag. */
  reason: z.string().max(240).nullable().default(null),
});

export type AnchorInput = z.infer<typeof AnchorSchema>;
export type SnapshotInput = z.infer<typeof SnapshotSchema>;
export type CommentContext = z.infer<typeof ContextSchema>;
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;
export type AnchorReport = z.infer<typeof AnchorReportSchema>;
export type Triage = z.infer<typeof TriageSchema>;
export type Priority = z.infer<typeof PrioritySchema>;
export type Status = z.infer<typeof StatusSchema>;
export type Category = z.infer<typeof CategorySchema>;

export interface WidgetMe {
  name: string;
  kind: "member" | "guest";
  /** Members can change status and report anchor health; guests can only comment and reply. */
  canModerate: boolean;
  project: { name: string };
}

/** A file on a comment, with a short-lived link to it. */
export interface WidgetAttachment {
  id: string;
  name: string;
  mime: string;
  url: string | null;
}

export interface WidgetReply {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface WidgetComment {
  id: string;
  number: number;
  body: string;
  title: string | null;
  status: Status;
  priority: Priority;
  author_name: string;
  created_at: string;
  anchor: AnchorInput | null;
  snapshot: SnapshotInput | null;
  anchor_state: "attached" | "suggested" | "detached" | "unknown";
  change_summary: { comparable: boolean; changes: { field: string; from: string; to: string }[] } | null;
  /** Client sign-off on a resolved comment: asked ("pending"), then confirmed or sent back. */
  client_review: ClientReview | null;
  /** The person using this widget session wrote the comment. */
  mine: boolean;
  attachments: WidgetAttachment[];
  replies: WidgetReply[];
}

/** Messages exchanged between the dashboard (parent) and the widget running inside the client site frame. */
export type HostToWidget =
  | { type: "bn:init"; token: string; mode: "comment" | "browse"; highlight?: string }
  | { type: "bn:mode"; mode: "comment" | "browse" }
  | { type: "bn:focus"; commentId: string }
  | { type: "bn:refresh" };

export type WidgetToHost =
  | { type: "bn:ready"; version: string }
  | { type: "bn:navigated"; url: string; title: string }
  | { type: "bn:created"; commentId: string }
  | { type: "bn:selected"; commentId: string };

export const WIDGET_PROTOCOL_VERSION = "1";
