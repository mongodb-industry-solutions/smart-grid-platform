import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") ?? "10", 10);

    const clientPromise = await getMongoClientPromise();
    const db = clientPromise.db(process.env.DATABASE_NAME);
    const readings = await db
      .collection("readings")
      .find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json(readings);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch readings" },
      { status: 500 }
    );
  }
}
