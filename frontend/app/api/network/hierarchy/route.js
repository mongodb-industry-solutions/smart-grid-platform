import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getNetworkHierarchy } from "@/lib/db/networkFilters";

const dbName = process.env.DATABASE_NAME;

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
    const utilities = parseList(searchParams, "utilities");
    const substations = parseList(searchParams, "substations");

    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const options = await getNetworkHierarchy(db, { utilities, substations });
    return NextResponse.json(options);
  } catch (error) {
    console.error("Error fetching network hierarchy:", error);
    return NextResponse.json(
      { utilities: [], substations: [], feeders: [], error: "Failed to fetch hierarchy" },
      { status: 500 }
    );
  }
}
