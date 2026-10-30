import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getAnomalies } from "@/lib/db/anomalies";
import { cached } from "@/lib/cache/ttlCache";

const dbName = process.env.DATABASE_NAME;
// Polled by every viewer; a few seconds of sharing removes the duplicate work.
const LIVE_TTL_MS = 5_000;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    // threshold 0 (or less) means "show all deviations, regardless of σ".
    const parsed = parseFloat(searchParams.get("threshold"));
    const threshold = Number.isFinite(parsed) && parsed >= 0 ? parsed : 3;

    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const anomalies = await cached(`anomalies:${threshold}`, LIVE_TTL_MS, () =>
      getAnomalies(db, { threshold })
    );

    return NextResponse.json({ anomalies, threshold });
  } catch (error) {
    console.error("Error fetching anomalies data:", error);
    return NextResponse.json(
      { anomalies: null, error: "Failed to fetch anomalies data" },
      { status: 500 }
    );
  }
}
