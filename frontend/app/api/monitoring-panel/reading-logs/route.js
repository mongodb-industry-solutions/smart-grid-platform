import getMongoClientPromise from "@/lib/mongodb";

const dbName = process.env.DATABASE_NAME;
const readingsCollectionName = process.env.READINGS_COLLECTION_NAME || "readings";

// Native reading cadence (ms). The live chart walks consecutive periods on this
// uniform grid, so we can locate a period arithmetically instead of scanning
// every distinct timestamp in the (large) collection on each tick.
const CADENCE_MS = 15 * 60 * 1000;
// periodIndex 0 starts this many periods before the latest, so the chart opens
// on recent data (not 30 days ago) and quickly catches up to the live feed.
const START_BACK = 48;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const periodIndex = parseInt(searchParams.get("periodIndex") ?? "0");
  const limit = parseInt(searchParams.get("limit") ?? "5");

  try {
    const mongoClient = await getMongoClientPromise();
    const db = mongoClient.db(dbName);
    const collection = db.collection(readingsCollectionName);

    // Latest reading period (indexed on the timeField — fast).
    const latestDoc = await collection.findOne(
      { voltage: { $ne: null } },
      { projection: { _id: 0, timestamp: 1 }, sort: { timestamp: -1 } }
    );
    if (!latestDoc) {
      return Response.json([]);
    }
    const latest = new Date(latestDoc.timestamp).getTime();

    // Walk forward from START_BACK periods ago; clamp at the latest period so the
    // feed follows the live feeder instead of running off the end and stopping.
    let target = latest - (START_BACK - periodIndex) * CADENCE_MS;
    if (target > latest) target = latest;
    const currentTimestamp = new Date(target);

    const readings = await collection
      .find(
        { timestamp: currentTimestamp },
        {
          projection: {
            _id: 0,
            dataid: 1,
            timestamp: 1,
            voltage: 1,
            current: 1,
            power: 1,
            energy: 1,
            power_factor: 1,
            frequency: 1,
            volt_leg_1: 1,
            volt_leg_2: 1,
          },
        }
      )
      .limit(limit)
      .toArray();

    return Response.json(readings);
  } catch (error) {
    console.error("Error fetching readings from MongoDB:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
