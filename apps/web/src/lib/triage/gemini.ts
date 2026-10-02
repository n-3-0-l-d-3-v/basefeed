import { ApiError, FinishReason, GoogleGenAI, type GenerateContentResponse, type Part } from "@google/genai";
import { z } from "zod";
import { describe, finalize, Output, SYSTEM } from "./prompt";
import { PermanentTriageError, type TriageInput, type TriageProvider, type TriageResult } from "./types";

// Gemini accepts a JSON Schema subset; the $schema dialect marker is dropped when serialized.
const SCHEMA = { ...z.toJSONSchema(Output), $schema: undefined };

/** Older, slower and less in demand; used when the primary model is overloaded or out of free quota. */
const FALLBACK = "gemini-3.5-flash";

// The model stopped because of content policy: asking again gets the same answer.
const BLOCKED = new Set<FinishReason | undefined>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
]);

export class GeminiTriage implements TriageProvider {
  readonly name = "gemini";
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model = "gemini-3.8-flash",
  ) {
    // One quick retry smooths over brief "high demand" 503s; longer outages go back to the job queue.
    this.client = new GoogleGenAI({ apiKey, httpOptions: { timeout: 60_000, retryOptions: { attempts: 2 } } });
  }

  async triage(input: TriageInput): Promise<TriageResult> {
    const parts: Part[] = [];
    if (input.screenshot) parts.push({ inlineData: { mimeType: input.screenshot.mediaType, data: input.screenshot.base64 } });
    parts.push({ text: describe(input) });

    let response: GenerateContentResponse | undefined;
    for (const model of new Set([this.model, FALLBACK])) {
      try {
        response = await this.client.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: { systemInstruction: SYSTEM, responseMimeType: "application/json", responseJsonSchema: SCHEMA },
        });
        break;
      } catch (e) {
        // Invalid request or key, no access, unknown model: retrying fails the same way.
        if (e instanceof ApiError && [400, 401, 403, 404].includes(e.status)) throw new PermanentTriageError(`${e.status}: ${e.message}`);
        // Overloaded or out of quota (both per model): try the fallback, then let the job queue retry with backoff.
        if (model === FALLBACK || !(e instanceof ApiError && (e.status === 429 || e.status === 503))) throw e;
      }
    }
    if (!response) throw new Error("unreachable");

    const blocked = response.promptFeedback?.blockReason;
    if (blocked) throw new PermanentTriageError(`declined (${blocked})`);
    const finish = response.candidates?.[0]?.finishReason;
    if (BLOCKED.has(finish)) throw new PermanentTriageError(`declined (${finish})`);
    if (!response.text) throw new Error(`no structured output (finishReason ${finish})`);

    return { ...finalize(Output.parse(JSON.parse(response.text)), input), model: response.modelVersion ?? this.model };
  }
}
