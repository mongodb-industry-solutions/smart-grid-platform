/**
 * Seeds the knowledge base for the AI chatbot using Atlas AUTOMATED EMBEDDING
 * (Voyage AI native in Atlas):
 *   1. upserts the articles as plain text (Atlas generates the embeddings),
 *   2. creates the Vector Search index with an auto-embedded text field,
 *   3. creates the full-text search index for hybrid search.
 *
 * Run from the frontend/ directory (Node 20.6+ for --env-file):
 *   node --env-file=.env.local scripts/seedKnowledgeBase.mjs
 *
 * Requires MONGODB_URI, DATABASE_NAME. No Voyage key needed here — Atlas embeds
 * documents and queries. (The Voyage key is only used at runtime to compute
 * vectors for the Vector Map visualization.)
 */
import { MongoClient } from "mongodb";
import { KB_ARTICLES } from "../lib/ai/knowledgeBaseSeed.js";

const { MONGODB_URI, DATABASE_NAME } = process.env;

const KB_COLLECTION = process.env.KB_COLLECTION_NAME || "kb_articles";
const KB_VECTOR_INDEX = "kb_vector_index";
const KB_TEXT_INDEX = "kb_text_index";
const EMBED_MODEL = process.env.VOYAGE_MODEL || "voyage-3-large";

function assertEnv() {
  const missing = ["MONGODB_URI", "DATABASE_NAME"].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
}

async function ensureSearchIndex(col, definition) {
  const existing = await col.listSearchIndexes().toArray().catch(() => []);
  if (existing.some((i) => i.name === definition.name)) {
    console.log(`  • index "${definition.name}" already exists — skipping`);
    return;
  }
  await col.createSearchIndex(definition);
  console.log(`  • created index "${definition.name}"`);
}

async function main() {
  assertEnv();
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  try {
    const db = client.db(DATABASE_NAME);
    const col = db.collection(KB_COLLECTION);

    console.log(`Upserting ${KB_ARTICLES.length} articles (plain text) into ${DATABASE_NAME}.${KB_COLLECTION}…`);
    for (const a of KB_ARTICLES) {
      await col.updateOne(
        { slug: a.slug },
        {
          $set: {
            slug: a.slug,
            title: a.title,
            category: a.category,
            text: a.text,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }
    console.log(`  • ${KB_ARTICLES.length} articles upserted`);

    console.log(`Ensuring Atlas search indexes (auto-embedding with ${EMBED_MODEL})…`);
    await ensureSearchIndex(col, {
      name: KB_VECTOR_INDEX,
      type: "vectorSearch",
      definition: {
        fields: [{ type: "text", path: "text", model: EMBED_MODEL }],
      },
    });
    await ensureSearchIndex(col, {
      name: KB_TEXT_INDEX,
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            title: { type: "string" },
            text: { type: "string" },
            category: { type: "string" },
          },
        },
      },
    });

    console.log(
      "\nDone. Atlas builds search indexes asynchronously — give it a minute before querying."
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
