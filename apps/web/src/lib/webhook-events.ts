// Kept apart from lib/webhooks.ts (server-only: signing and delivery) so the Settings form can list the events.
export const WEBHOOK_EVENTS = {
  "comment.created": "A comment is added",
  "comment.status": "A comment changes status",
  "reply.created": "Someone replies",
  "triage.flagged": "AI flags a comment for a decision",
  "client.approved": "A client confirms a fix",
  "client.rejected": "A client sends a fix back",
} as const;
export type WebhookEvent = keyof typeof WEBHOOK_EVENTS;
