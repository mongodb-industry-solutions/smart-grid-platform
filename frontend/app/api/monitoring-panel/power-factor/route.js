import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getPowerFactor } from "@/lib/db/powerFactor";

const dbName = process.env.DATABASE_NAME;

export async function GET() {
  try {
    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const data = await getPowerFactor(db);

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching power factor:", error);
    return NextResponse.json(
      { powerFactor: null, error: "Failed to fetch power factor" },
      { status: 500 }
    );
  }
}
