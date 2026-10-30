import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import getQeClientPromise, { qeConfigError } from "@/lib/qeClient";

const dbName = process.env.DATABASE_NAME;

// Collections allowed for the QE explorer
const ALLOWED_COLLECTIONS = new Set([
  "metering_points",
  "metering_points_encrypted",
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

    // Steps 1-2 use regular aggregation on plaintext metering_points
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
    const collections = await db
      .listCollections({ name: collection })
      .toArray();

    if (collections.length === 0) {
      return NextResponse.json({
        code: "QE_NOT_SETUP",
        error:
          `Collection "${collection}" does not exist yet. ` +
          "To enable the Queryable Encryption demo, run the setup script: " +
          "uv run scripts/setup_qe.py --uri <uri> --db <db> — this creates the " +
          "encrypted collection with its encryption schema and key vault.",
      }, { status: 400 });
    }

    const err = validatePipeline(pipeline);
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    // "The Encrypted Doc" step deliberately reads through the NON-encrypted
    // client, so the UI can show the raw ciphertext the server actually stores.
    if (stepId === "encrypted") {
      const rows = await db
        .collection(collection)
        .aggregate(pipeline, { maxTimeMS: 20_000 })
        .toArray();
      return NextResponse.json({ rows: rows.slice(0, 200) });
    }

    // Remaining steps query through the autoEncryption client: the query value
    // is encrypted client-side, matched server-side against encrypted indexes,
    // and the result decrypted on return.
    const configError = qeConfigError();
    if (configError) {
      return NextResponse.json(
        { code: "QE_CONFIG", error: configError },
        { status: 400 }
      );
    }

    const qeClient = await getQeClientPromise();
    const rows = await qeClient
      .db(dbName)
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
