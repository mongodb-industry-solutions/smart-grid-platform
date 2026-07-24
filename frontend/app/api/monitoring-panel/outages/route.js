import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getOutagesSummary } from "@/lib/db/outages";

const dbName = process.env.DATABASE_NAME;

export async function GET() {
  try {
    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const summary = await getOutagesSummary(db);

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Error fetching outages data:", error);
    return NextResponse.json(
      { summary: null, error: "Failed to fetch outages data" },
      { status: 500 }
    );
  }
}
