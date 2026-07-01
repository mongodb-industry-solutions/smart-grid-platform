import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getGridStability } from "@/lib/db/gridStability";

const dbName = process.env.DATABASE_NAME;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const periodIndex = parseInt(searchParams.get("periodIndex") ?? "0");

  try {
    const client = await getMongoClientPromise();
    const db     = client.db(dbName);
    const data   = await getGridStability(db, periodIndex);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching grid stability:", error);
    return NextResponse.json(
      { error: "Failed to fetch grid stability data" },
      { status: 500 }
    );
  }
}
