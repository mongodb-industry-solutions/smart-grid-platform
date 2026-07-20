import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getAnomalies } from "@/lib/db/anomalies";

const dbName = process.env.DATABASE_NAME;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    // threshold 0 (or less) means "show all deviations, regardless of σ".
    const parsed = parseFloat(searchParams.get("threshold"));
    const threshold = Number.isFinite(parsed) && parsed >= 0 ? parsed : 3;

    // Optional periodIndex advances the "reading under test" through time.
    const rawPeriod = searchParams.get("periodIndex");
    const periodIndex =
      rawPeriod != null && Number.isFinite(parseInt(rawPeriod))
        ? parseInt(rawPeriod)
        : null;

    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const anomalies = await getAnomalies(db, { threshold, periodIndex });

    return NextResponse.json({ anomalies, threshold });
  } catch (error) {
    console.error("Error fetching anomalies data:", error);
    return NextResponse.json(
      { anomalies: null, error: "Failed to fetch anomalies data" },
      { status: 500 }
    );
  }
}
