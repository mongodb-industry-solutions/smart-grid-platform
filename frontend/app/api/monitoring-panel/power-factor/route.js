import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getPowerFactor } from "@/lib/db/powerFactor";
import { cached } from "@/lib/cache/ttlCache";

const dbName = process.env.DATABASE_NAME;
const LIVE_TTL_MS = 5_000;

export async function GET() {
  try {
    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const data = await cached("power-factor", LIVE_TTL_MS, () => getPowerFactor(db));

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching power factor:", error);
    return NextResponse.json(
      { powerFactor: null, error: "Failed to fetch power factor" },
      { status: 500 }
    );
  }
}
