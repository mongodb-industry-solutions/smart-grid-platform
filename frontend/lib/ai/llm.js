import { ChatAnthropic } from "@langchain/anthropic";

// Claude is reached through the Grove gateway (Azure API Management), which
// authenticates with an `api-key` header instead of the standard x-api-key.
const GROVE_URL =
  process.env.GROVE_ANTHROPIC_URL ||
  "https://grove-gateway-prod.azure-api.net/grove-foundry-prod/anthropic";

export const CHAT_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

/**
 * Builds a ChatAnthropic client pointed at the Grove gateway.
 * @param {{ maxTokens?: number, temperature?: number }} [opts]
 */
export function makeLLM(opts = {}) {
  const apiKey = process.env.GROVE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("GROVE_API_KEY is not set");

  return new ChatAnthropic({
    model: CHAT_MODEL,
    apiKey, // also sent as x-api-key; the gateway uses the api-key header below
    anthropicApiUrl: GROVE_URL,
    maxTokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0,
    clientOptions: {
      defaultHeaders: {
        "api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    },
  });
}
