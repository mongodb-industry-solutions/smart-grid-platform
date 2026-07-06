import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getForecastComponentModel } from "@/lib/db/forecastModel";

const dbName = process.env.DATABASE_NAME;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const component = searchParams.get("component") || "demand";

    const client = await getMongoClientPromise();
    const db = client.db(dbName);
    const data = await getForecastComponentModel(db, component);
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching forecast model:", error);
    return NextResponse.json(
      { error: "Failed to fetch data model" },
      { status: 500 }
    );
  }
}
