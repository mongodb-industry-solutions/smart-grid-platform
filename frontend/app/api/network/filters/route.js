import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getNetworkFilters } from "@/lib/db/networkFilters";

const dbName = process.env.DATABASE_NAME;

// Parse a repeatable/comma-separated query param into a clean string array.
function parseList(searchParams, key) {
  const values = searchParams.getAll(key).flatMap((v) => v.split(","));
  return values.map((v) => v.trim()).filter(Boolean);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const states = parseList(searchParams, "states");
    const feederIds = parseList(searchParams, "feeders");

    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const filters = await getNetworkFilters(db, { states, feederIds });

    return NextResponse.json(filters);
  } catch (error) {
    console.error("Error fetching network filters:", error);
    return NextResponse.json(
      { states: [], feeders: [], meters: [], error: "Failed to fetch filters" },
      { status: 500 }
    );
  }
}
