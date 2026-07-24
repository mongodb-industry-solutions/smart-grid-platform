import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getRegionalForecast } from "@/lib/db/regionalForecast";

const dbName = process.env.DATABASE_NAME;

// Parse a repeatable/comma-separated query param into a clean string array.
function parseList(searchParams, key) {
  return searchParams
    .getAll(key)
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}

const EMPTY = { level: "feeder", window: null, pipeline: [], capacityPipeline: [], regions: [] };

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const level = searchParams.get("level") || "feeder";
    const horizonParam = Number(searchParams.get("horizon"));
    const horizonHours = Number.isFinite(horizonParam) && horizonParam > 0 ? horizonParam : 24;

    const opts = {
      level,
      regionIds: parseList(searchParams, "ids"),
      parentScope: {
        states: parseList(searchParams, "states"),
        utilities: parseList(searchParams, "utilities"),
        substations: parseList(searchParams, "substations"),
      },
      meterIds: parseList(searchParams, "meters"),
      horizonHours,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
    };

    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const forecast = await getRegionalForecast(db, opts);
    return NextResponse.json(forecast);
  } catch (error) {
    console.error("Error fetching regional forecast:", error);
    return NextResponse.json(
      { ...EMPTY, error: "Failed to fetch forecast" },
      { status: 500 }
    );
  }
}
