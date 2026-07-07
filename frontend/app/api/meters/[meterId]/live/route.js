import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";

export async function GET(request, { params }) {
  const { meterId } = await params;

  const client = await getMongoClientPromise();
  const db = client.db(process.env.DATABASE_NAME);

  const doc = await db
    .collection("readings")
    .findOne(
      // Require voltage so a partial "heartbeat" doc can't shadow the meter's
      // most recent real reading.
      { dataid: meterId, voltage: { $ne: null } },
      {
        sort: { timestamp: -1 },
        projection: {
          _id: 0,
          dataid: 1,
          timestamp: 1,
          voltage: 1,
          volt_leg_1: 1,
          volt_leg_2: 1,
          current: 1,
          power: 1,
          energy: 1,
          power_factor: 1,
          frequency: 1,
        },
      }
    );

  if (!doc) {
    return NextResponse.json({ error: "Meter not found" }, { status: 404 });
  }

  return NextResponse.json({
    dataid:       doc.dataid,
    timestamp:    doc.timestamp?.toISOString?.() ?? doc.timestamp,
    voltage:      doc.voltage,
    volt_leg_1:   doc.volt_leg_1,
    volt_leg_2:   doc.volt_leg_2,
    current:      doc.current,
    power:        doc.power,
    energy:       doc.energy,
    power_factor: doc.power_factor,
    frequency:    doc.frequency,
  });
}
