// Direct Voyage AI embeddings call (Bearer auth), matching the working example.
// Used only to compute vectors for the Vector Map — search itself uses Atlas
// automated embedding.
const VOYAGE_API_URL = "https://ai.mongodb.com/v1/embeddings";

export const EMBED_MODEL =
  process.env.VOYAGE_MODEL || process.env.EMBEDDING_MODEL || "voyage-3-large";

/**
 * Embeds texts with Voyage AI.
 * @param {string[]} texts
 * @param {"document"|"query"} inputType
 * @returns {Promise<number[][]>}
 */
export async function embedTexts(texts, inputType = "document") {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY is not set");

  const res = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts, input_type: inputType }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Voyage ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  // Preserve input order.
  return (json.data ?? [])
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((d) => d.embedding);
}

/** Embeds a single search query. */
export async function embedQuery(text) {
  const [vector] = await embedTexts([text], "query");
  return vector;
}
