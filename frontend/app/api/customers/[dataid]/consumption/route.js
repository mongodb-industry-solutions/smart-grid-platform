import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getConsumptionTrend } from "@/lib/db/customers";

const dbName = process.env.DATABASE_NAME;

export async function GET(request, { params }) {
  try {
    const { dataid } = await params;
    const { searchParams } = new URL(request.url);
    const region = searchParams.get("region") || null;

    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const trend = await getConsumptionTrend(db, Number(dataid), region);

    return NextResponse.json(trend);
  } catch (error) {
    console.error("Error fetching consumption trend:", error);
    return NextResponse.json(
      { points: [], error: "Failed to fetch consumption trend" },
      { status: 500 }
    );
  }
}
