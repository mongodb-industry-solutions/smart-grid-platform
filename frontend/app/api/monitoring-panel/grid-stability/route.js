import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getGridStability } from "@/lib/db/gridStability";

const dbName = process.env.DATABASE_NAME;

export async function GET() {
  try {
    const client = await getMongoClientPromise();
    const db     = client.db(dbName);
    const data   = await getGridStability(db);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching grid stability:", error);
    return NextResponse.json(
      { error: "Failed to fetch grid stability data" },
      { status: 500 }
    );
  }
}
