import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getWeatherForecast } from "@/lib/db/weatherForecast";

const dbName = process.env.DATABASE_NAME;

const EMPTY = { regions: [], region: null, window: null, points: [], nowIndex: 0, pipeline: [] };

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
    // Only override the DB-layer default when the client explicitly asks.
    const lookbackParam = Number(searchParams.get("lookbackDays"));
    const lookbackDays =
      Number.isFinite(lookbackParam) && lookbackParam > 0 ? lookbackParam : undefined;

    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const forecast = await getWeatherForecast(db, {
      states: parseList(searchParams, "states"),
      feeders: parseList(searchParams, "feeders"),
      meterIds: parseList(searchParams, "ids"),
      lookbackDays,
    });
    return NextResponse.json(forecast);
  } catch (error) {
    console.error("Error fetching weather-adjusted forecast:", error);
    return NextResponse.json(
      { ...EMPTY, error: "Failed to fetch forecast" },
      { status: 500 }
    );
  }
}
