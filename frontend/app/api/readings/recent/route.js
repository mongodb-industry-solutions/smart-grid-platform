import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const meterId = searchParams.get("meterId");

    const client = await clientPromise();
    const db = client.db(process.env.DATABASE_NAME);

    const query = meterId ? { dataid: Number(meterId) } : {};

    const readings = await db
      .collection("readings")
      .find(query, {
        projection: {
          _id: 0,
          timestamp: 1,
          dataid: 1,
          avg_reading: 1,
          volt_leg_1: 1,
          volt_leg_2: 1,
        },
      })
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json(readings);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch readings" },
      { status: 500 }
    );
  }
}