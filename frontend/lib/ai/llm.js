import { ChatAnthropic } from "@langchain/anthropic";

export const CHAT_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

/**
 * Builds a ChatAnthropic client.
 *
 * Two ways to reach Claude:
 *   1. Grove gateway (MongoDB-internal, Azure API Management) — used when
 *      GROVE_API_KEY + GROVE_ANTHROPIC_URL are set. The gateway authenticates
 *      with an `api-key` header instead of the standard x-api-key.
 *   2. Standard Anthropic API — used otherwise, with ANTHROPIC_API_KEY. This is
 *      the path for anyone running the demo outside MongoDB.
 *
 * @param {{ maxTokens?: number, temperature?: number }} [opts]
 */
export function makeLLM(opts = {}) {
  const maxTokens = opts.maxTokens ?? 1024;
  const temperature = opts.temperature ?? 0;

  const groveKey = process.env.GROVE_API_KEY;
  // Grove's URL is optional — default to the prod gateway when only the key is set.
  const groveUrl =
    process.env.GROVE_ANTHROPIC_URL ||
    "https://grove-gateway-prod.azure-api.net/grove-foundry-prod/anthropic";

  // Prefer the Grove gateway when a Grove key is present (MongoDB-internal).
  if (groveKey) {
    return new ChatAnthropic({
      model: CHAT_MODEL,
      apiKey: groveKey, // also sent as x-api-key; the gateway uses the api-key header below
      anthropicApiUrl: groveUrl,
      maxTokens,
      temperature,
      clientOptions: {
        defaultHeaders: {
          "api-key": groveKey,
          "anthropic-version": "2023-06-01",
        },
      },
    });
  }

  // Fall back to the standard Anthropic API (api.anthropic.com + x-api-key).
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Set ANTHROPIC_API_KEY (standard Anthropic API) or GROVE_API_KEY + GROVE_ANTHROPIC_URL (Grove gateway)."
    );
  }

  return new ChatAnthropic({ model: CHAT_MODEL, apiKey, maxTokens, temperature });
}
