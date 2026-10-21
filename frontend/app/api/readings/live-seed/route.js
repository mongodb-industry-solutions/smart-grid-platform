import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

// Matches MAX_HISTORY in the Average Power chart.
const HISTORY_POINTS = 48;

/**
 * Seed data for the live panels. When the feeder is off the SSE stream has
 * nothing to push, so the panels fetch their last-known state from here:
 *
 *  - history: fleet-average power per reading interval (last 48 intervals),
 *    computed on the server from the readings time-series.
 *  - latest: the most recent reading per meter (latest_readings), same shape
 *    the /api/stream SSE endpoint pushes.
 */
export async function GET() {
  try {
    const client = await clientPromise();
    const db = client.db(process.env.DATABASE_NAME);

    // Fleet-average power for the most recent HISTORY_POINTS reading intervals.
    // Group first, then take the NEWEST intervals ($sort -1 + $limit), and flip
    // back to chronological order for the chart.
    const history = await db
      .collection("readings")
      .aggregate([
        { $sort: { timestamp: -1 } },
        { $limit: 12_000 }, // 250 meters x ~48 intervals — covers the chart window
        { $group: { _id: "$timestamp", value: { $avg: "$power" } } },
        { $sort: { _id: -1 } },
        { $limit: HISTORY_POINTS },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: "$_id", value: { $divide: ["$value", 1000] } } },
      ])
      .toArray();

    const latest = await db
      .collection("latest_readings")
      .find(
        {},
        {
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
      )
      .toArray();

    return NextResponse.json({ history, latest });
  } catch (error) {
    console.error("live-seed error:", error);
    return NextResponse.json(
      { error: "Failed to fetch seed data" },
      { status: 500 }
    );
  }
}
