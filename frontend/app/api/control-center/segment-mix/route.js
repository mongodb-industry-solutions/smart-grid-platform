import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getSegmentMix } from "@/lib/db/segmentMix";

const dbName = process.env.DATABASE_NAME;

export async function GET(request) {
  try {
    const scope = new URL(request.url).searchParams.get("scope") || "all";

    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const mix = await getSegmentMix(db, { scope });

    return NextResponse.json(mix);
  } catch (error) {
    console.error("Error fetching segment mix:", error);
    return NextResponse.json(
      { error: "Failed to fetch segment mix" },
      { status: 500 }
    );
  }
}
