import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";

export async function GET(request, { params }) {
  const { meterId } = await params;

  const client = await getMongoClientPromise();
  const db = client.db(process.env.DATABASE_NAME);

  const doc = await db
    .collection("readings")
    .findOne(
      { dataid: meterId },
      {
        sort: { timestamp: -1 },
        projection: { _id: 0, timestamp: 1, dataid: 1, avg_reading: 1, volt_leg_1: 1, volt_leg_2: 1 },
      }
    );

  if (!doc) {
    return NextResponse.json({ error: "Meter not found" }, { status: 404 });
  }

  return NextResponse.json({
    dataid: doc.dataid,
    timestamp: doc.timestamp?.toISOString?.() ?? doc.timestamp,
    avg_reading: doc.avg_reading,
    volt_leg_1: doc.volt_leg_1,
    volt_leg_2: doc.volt_leg_2,
  });
}
