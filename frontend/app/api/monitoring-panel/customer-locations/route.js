import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getCustomerLocations } from "@/lib/db/customerLocations";

const dbName = process.env.DATABASE_NAME;

export async function GET() {
  try {
    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const locations = await getCustomerLocations(db);

    return NextResponse.json({ locations });
  } catch (error) {
    console.error("Error fetching customer locations:", error);
    return NextResponse.json(
      { locations: [], error: "Failed to fetch customer locations" },
      { status: 500 }
    );
  }
}
