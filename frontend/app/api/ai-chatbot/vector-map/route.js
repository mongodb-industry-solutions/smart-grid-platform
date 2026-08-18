import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { embedTexts, embedQuery } from "@/lib/ai/voyage";
import { hybridSearch } from "@/lib/ai/knowledgeBase";
import { sameOriginOk } from "@/lib/http/sameOrigin";

const dbName = process.env.DATABASE_NAME;
const KB = process.env.KB_COLLECTION_NAME || "kb_articles";

// Atlas auto-embeds the documents for search, but those vectors aren't readable.
// For the graph we embed the article texts ourselves (Voyage key) once per
// process and cache them; only the query is embedded per request.
let cache = null;

async function loadDocEmbeddings(db) {
  const docs = await db
    .collection(KB)
    .find({}, { projection: { _id: 0, slug: 1, title: 1, category: 1, text: 1 } })
    .sort({ slug: 1 })
    .toArray();
  if (cache && cache.count === docs.length) return cache;
  const embeddings = docs.length
    ? await embedTexts(docs.map((d) => `${d.title}\n\n${d.text}`), "document")
    : [];
  cache = {
    count: docs.length,
    docs: docs.map((d) => ({ slug: d.slug, title: d.title, category: d.category })),
    embeddings,
  };
  return cache;
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/**
 * Similarity graph data: cosine similarity between the query and each KB article,
 * plus which articles the hybrid search retrieved. Vectors are computed with the
 * Voyage key (search itself uses Atlas auto-embedding).
 */
export async function POST(request) {
  if (!sameOriginOk(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }
  try {
    const { query, category } = await request.json();
    if (!query) return NextResponse.json({ articles: [] });

    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const { docs, embeddings } = await loadDocEmbeddings(db);
    if (!docs.length) return NextResponse.json({ articles: [] });

    const queryVector = await embedQuery(query);

    const hits = await hybridSearch(db, query, { k: 5, category: category || null });
    const retrievedSlugs = new Set(hits.map((h) => h.slug));

    const articles = docs
      .map((d, i) => ({
        slug: d.slug,
        title: d.title,
        category: d.category,
        similarity: Math.round(cosine(queryVector, embeddings[i]) * 1000) / 1000,
        retrieved: retrievedSlugs.has(d.slug),
      }))
      .sort((a, b) => b.similarity - a.similarity);

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("vector-map error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to build similarity graph" },
      { status: 500 }
    );
  }
}
