import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";

const dbName = process.env.DATABASE_NAME;

// Only allow reads against these collections
const ALLOWED_COLLECTIONS = new Set([
  "readings",
  "latest_readings",
  "meter_network_map",
  "network",
  "customer_db",
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
    const { pipeline, collection } = await request.json();

    if (!ALLOWED_COLLECTIONS.has(collection)) {
      return NextResponse.json(
        { error: `Collection "${collection}" is not allowed` },
        { status: 400 }
      );
    }

    const err = validatePipeline(pipeline);
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    const client = await getMongoClientPromise();
    const db = client.db(dbName);
    const rows = await db
      .collection(collection)
      .aggregate(pipeline, { maxTimeMS: 20_000 })
      .toArray();

    return NextResponse.json({ rows: rows.slice(0, 200) });
  } catch (error) {
    console.error("Time-series explorer error:", error);
    return NextResponse.json(
      { error: error.message || "Pipeline execution failed" },
      { status: 500 }
    );
  }
}
