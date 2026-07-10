import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getWeatherForecast } from "@/lib/db/weatherForecast";

const dbName = process.env.DATABASE_NAME;

const EMPTY = { regions: [], region: null, window: null, points: [], nowIndex: 0, pipeline: [] };

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get("region") || undefined;
    const lookbackParam = Number(searchParams.get("lookbackDays"));
    const lookbackDays =
      Number.isFinite(lookbackParam) && lookbackParam > 0 ? lookbackParam : 7;

    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const forecast = await getWeatherForecast(db, { region, lookbackDays });
    return NextResponse.json(forecast);
  } catch (error) {
    console.error("Error fetching weather-adjusted forecast:", error);
    return NextResponse.json(
      { ...EMPTY, error: "Failed to fetch forecast" },
      { status: 500 }
    );
  }
}
