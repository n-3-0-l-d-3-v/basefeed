import type { Triage } from "@bn/shared";

export interface TriageInput {
  comment: { body: string; priority: string; authorKind: "team" | "client" };
  element: { selector: string; tag: string; classes: string[]; excerpt: string };
  page: { url: string; title: string; breakpoint: string; viewportWidth: number; device: string };
  openComments: { number: number; summary: string }[];
  screenshot: { mediaType: "image/png" | "image/jpeg" | "image/webp"; base64: string } | null;
}

export interface TriageResult extends Triage {
  model: string;
}

/** The model declined or the request can never succeed: don't retry, mark triage unavailable. */
export class PermanentTriageError extends Error {}

/** Swappable so the studio isn't locked to one AI vendor (Basenine spec §11). */
export interface TriageProvider {
  readonly name: string;
  triage(input: TriageInput): Promise<TriageResult>;
}
