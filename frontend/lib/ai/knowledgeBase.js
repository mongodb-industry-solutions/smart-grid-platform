const KB_COLLECTION = process.env.KB_COLLECTION_NAME || "kb_articles";
const KB_VECTOR_INDEX = "kb_vector_index";
const KB_TEXT_INDEX = "kb_text_index";

// Reciprocal Rank Fusion constant (standard default).
const RRF_K = 60;

/**
 * Hybrid search over the knowledge base with Atlas AUTOMATED EMBEDDING: the
 * $vectorSearch stage takes query TEXT (Atlas embeds it with Voyage — no API key
 * in app code) and $search does full-text. The two rankings are fused with
 * Reciprocal Rank Fusion.
 *
 * @param {import("mongodb").Db} db
 * @param {string} query natural-language query
 * @param {{ k?: number, numCandidates?: number, category?: string|null }} [opts]
 * @returns {Promise<Array<{ id, slug, title, category, text }>>}
 */
export async function hybridSearch(db, query, { k = 5, numCandidates = 100, category = null } = {}) {
  const col = db.collection(KB_COLLECTION);
  const perList = k * 2;
  const project = { _id: 1, slug: 1, title: 1, category: 1, text: 1 };

  const vectorPipeline = [
    {
      $vectorSearch: {
        index: KB_VECTOR_INDEX,
        path: "text",
        query, // Atlas auto-embeds this text
        numCandidates,
        limit: perList,
      },
    },
    ...(category ? [{ $match: { category } }] : []),
    { $project: project },
  ];

  const textPipeline = [
    { $search: { index: KB_TEXT_INDEX, text: { query, path: ["title", "text"] } } },
    ...(category ? [{ $match: { category } }] : []),
    { $limit: perList },
    { $project: project },
  ];

  const [vectorHits, textHits] = await Promise.all([
    col.aggregate(vectorPipeline).toArray().catch(() => []),
    col.aggregate(textPipeline).toArray().catch(() => []),
  ]);

  // Fuse the two ranked lists with Reciprocal Rank Fusion.
  const fused = new Map();
  const addList = (list) => {
    list.forEach((doc, rank) => {
      const id = String(doc._id);
      const entry = fused.get(id) ?? { doc, score: 0 };
      entry.score += 1 / (RRF_K + rank + 1);
      entry.doc = doc;
      fused.set(id, entry);
    });
  };
  addList(vectorHits);
  addList(textHits);

  return [...fused.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ doc }) => ({
      id: String(doc._id),
      slug: doc.slug,
      title: doc.title,
      category: doc.category,
      text: doc.text,
    }));
}
