import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getDemandForecast } from "@/lib/db/demandForecast";

const dbName = process.env.DATABASE_NAME;

// Parse a repeatable/comma-separated query param into a clean string array.
function parseList(searchParams, key) {
  return searchParams
    .getAll(key)
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const selection = {
      states: parseList(searchParams, "states"),
      feeders: parseList(searchParams, "feeders"),
      meterIds: parseList(searchParams, "ids"),
    };

    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const forecast = await getDemandForecast(db, selection);

    return NextResponse.json(forecast);
  } catch (error) {
    console.error("Error fetching demand forecast:", error);
    return NextResponse.json(
      { pipeline: [], regions: [], bars: [], error: "Failed to fetch demand" },
      { status: 500 }
    );
  }
}
