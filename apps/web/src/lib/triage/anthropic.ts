import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, finalize, Output, SYSTEM } from "./prompt";
import { PermanentTriageError, type TriageInput, type TriageProvider, type TriageResult } from "./types";

export class AnthropicTriage implements TriageProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model = "claude-opus-5-5",
  ) {
    this.client = new Anthropic({ apiKey, timeout: 60_000 });
  }

  async triage(input: TriageInput): Promise<TriageResult> {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (input.screenshot)
      content.push({ type: "image", source: { type: "base64", media_type: input.screenshot.mediaType, data: input.screenshot.base64 } });
    content.push({ type: "text", text: describe(input) });

    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(Output) },
        system: SYSTEM,
        messages: [{ role: "user", content }],
      });
    } catch (e) {
      // Bad request / auth / permissions will fail the same way on retry.
      if (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
        throw new PermanentTriageError(`${e.status}: ${e.message}`);
      throw e; // rate limits, 5xx, network: the job queue retries with backoff
    }

    if (response.stop_reason === "refusal") throw new PermanentTriageError(`declined (${response.stop_details?.category ?? "unspecified"})`);
    if (!response.parsed_output) throw new Error(`no structured output (stop_reason ${response.stop_reason})`);

    return { ...finalize(response.parsed_output, input), model: response.model };
  }
}
