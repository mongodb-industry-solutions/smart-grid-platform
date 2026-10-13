import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";

const dbName = process.env.DATABASE_NAME;

// Collections allowed for the QE explorer
const ALLOWED_COLLECTIONS = new Set([
  "customer_db",
  "customer_db_encrypted",
]);

// Block write/exec stages
const BLOCKED_STAGES = new Set(["$out", "$merge", "$function", "$where"]);

function validatePipeline(pipeline) {
  if (!Array.isArray(pipeline)) return "Pipeline must be an array";
  for (const stage of pipeline) {
    for (const key of Object.keys(stage)) {
      if (BLOCKED_STAGES.has(key)) return `Stage ${key} is not allowed`;
    }
  }
  return null;
}

export async function POST(request) {
  try {
    const { stepId, pipeline, collection, mode, query, options } =
      await request.json();

    if (!ALLOWED_COLLECTIONS.has(collection)) {
      return NextResponse.json(
        { error: `Collection "${collection}" is not allowed` },
        { status: 400 }
      );
    }

    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    // Steps 1-2 use regular aggregation on plaintext customer_db
    if (!mode || mode !== "encrypted_find") {
      const err = validatePipeline(pipeline);
      if (err) {
        return NextResponse.json({ error: err }, { status: 400 });
      }

      const rows = await db
        .collection(collection)
        .aggregate(pipeline, { maxTimeMS: 20_000 })
        .toArray();

      return NextResponse.json({ rows: rows.slice(0, 200) });
    }

    // Steps 3-6: encrypted collection operations
    // Check if the encrypted collection exists
    const collections = await db
      .listCollections({ name: collection })
      .toArray();

    if (collections.length === 0) {
      return NextResponse.json({
        error:
          `Collection "${collection}" does not exist yet. ` +
          "To enable the Queryable Encryption demo, run the setup script: " +
          "python backend/scripts/setup_qe.py — this creates the encrypted " +
          "collection with the required encryption schema and key vault.",
      }, { status: 400 });
    }

    // Run the pipeline against the encrypted collection
    // When QE is configured on the MongoClient (via autoEncryption),
    // queries automatically encrypt/decrypt transparently
    const err = validatePipeline(pipeline);
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    const rows = await db
      .collection(collection)
      .aggregate(pipeline, { maxTimeMS: 20_000 })
      .toArray();

    return NextResponse.json({ rows: rows.slice(0, 200) });
  } catch (error) {
    console.error("Queryable encryption explorer error:", error);
    return NextResponse.json(
      { error: error.message || "Operation failed" },
      { status: 500 }
    );
  }
}
