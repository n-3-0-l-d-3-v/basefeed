import { ApiError, FinishReason, GoogleGenAI, type GenerateContentResponse, type Part } from "@google/genai";
import { z } from "zod";
import { describe, finalize, Output, SYSTEM } from "./prompt";
import { PermanentTriageError, type TriageInput, type TriageProvider, type TriageResult } from "./types";

// Gemini accepts a JSON Schema subset; the $schema dialect marker is dropped when serialized.
const SCHEMA = { ...z.toJSONSchema(Output), $schema: undefined };

/**
 * Tried in order when a model is overloaded or out of quota. The free tier allows only ~20 requests
 * a day per model, and each model has its own allowance, so the chain is also the daily capacity.
 */
const FALLBACKS = ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"];

const CALL_TIMEOUT_MS = 25_000;
// 0 is a request that never got an HTTP answer (our own timeout, a dropped connection).
const NEXT_MODEL = [0, 404, 429, 500, 503, 504];

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
    // No retries inside the SDK: a failed model falls through to the next one below, and anything
    // longer goes back to the job queue. The runner has 60 s in total, so one call gets 25 s.
    this.client = new GoogleGenAI({ apiKey, httpOptions: { timeout: CALL_TIMEOUT_MS, retryOptions: { attempts: 1 } } });
  }

  async triage(input: TriageInput): Promise<TriageResult> {
    const parts: Part[] = [];
    if (input.screenshot) parts.push({ inlineData: { mimeType: input.screenshot.mediaType, data: input.screenshot.base64 } });
    parts.push({ text: describe(input) });

    let response: GenerateContentResponse | undefined;
    const started = Date.now();
    const models = [...new Set([this.model, ...FALLBACKS])];
    for (const model of models) {
      try {
        response = await this.client.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: { systemInstruction: SYSTEM, responseMimeType: "application/json", responseJsonSchema: SCHEMA },
        });
        break;
      } catch (e) {
        const status = e instanceof ApiError ? e.status : 0;
        const last = model === models.at(-1);
        // Invalid request or key, no access: retrying fails the same way. So does a model that no longer exists, once the chain is exhausted.
        if ([400, 401, 403].includes(status) || (status === 404 && last)) throw new PermanentTriageError(`${status}: ${(e as Error).message}`);
        // Overloaded, out of quota, retired or timed out (all per model): try the next one while there is
        // time for another call, then let the job queue retry with backoff.
        if (last || !NEXT_MODEL.includes(status) || Date.now() - started > CALL_TIMEOUT_MS) throw e;
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
