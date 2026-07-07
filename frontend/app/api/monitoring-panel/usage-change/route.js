import getMongoClientPromise from "@/lib/mongodb";

const dbName = process.env.DATABASE_NAME;
const readingsCollectionName = process.env.READINGS_COLLECTION_NAME || "readings";

const WINDOW_MS = { "1h": 3_600_000, "6h": 21_600_000, "24h": 86_400_000 };
const WINDOW_LABELS = { "1h": "last hour", "6h": "last 6 hours", "24h": "last 24 hours" };

// Latest distinct reading period at or before `beforeTs` (exclusive when
// beforeTs is null → the newest period overall). The voltage guard skips
// partial "heartbeat" docs that carry no real reading.
async function latestPeriod(collection, beforeTs = null) {
  const pipeline = [
    { $match: { voltage: { $ne: null } } },
    { $group: { _id: "$timestamp" } },
  ];
  if (beforeTs) pipeline.push({ $match: { _id: { $lte: beforeTs } } });
  pipeline.push({ $sort: { _id: -1 } }, { $limit: 1 });
  const doc = await collection.aggregate(pipeline).next();
  return doc?._id ?? null;
}

// Total energy consumed by the fleet between two reading periods. `energy` is a
// cumulative per-meter register, so consumption is the difference of a meter's
// reading at each endpoint, summed across every meter present at both (kWh).
// Non-positive deltas (meter resets/gaps) are ignored.
async function windowUsageKwh(collection, fromTs, toTs) {
  if (!fromTs || !toTs) return null;
  const [agg] = await collection
    .aggregate([
      { $match: { timestamp: { $in: [fromTs, toTs] }, energy: { $ne: null } } },
      {
        $group: {
          _id: "$dataid",
          start: {
            $max: { $cond: [{ $eq: ["$timestamp", fromTs] }, "$energy", null] },
          },
          end: {
            $max: { $cond: [{ $eq: ["$timestamp", toTs] }, "$energy", null] },
          },
        },
      },
      { $match: { start: { $ne: null }, end: { $ne: null } } },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $let: {
                vars: { delta: { $subtract: ["$end", "$start"] } },
                in: { $cond: [{ $gt: ["$$delta", 0] }, "$$delta", 0] },
              },
            },
          },
        },
      },
    ])
    .toArray();
  return agg?.total ?? 0;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const windowKey = searchParams.get("window") ?? "1h";
  const windowMs  = WINDOW_MS[windowKey] ?? WINDOW_MS["1h"];

  try {
    const mongoClient = await getMongoClientPromise();
    const db          = mongoClient.db(dbName);
    const collection  = db.collection(readingsCollectionName);

    // Most recent distinct timestamp that has real reading data. (A partial
    // "heartbeat" doc can carry only power/energy and a current timestamp;
    // requiring voltage keeps us on a genuine reading period.)
    const latestDoc = await collection
      .aggregate([
        { $match: { voltage: { $ne: null } } },
        { $group: { _id: "$timestamp" } },
        { $sort:  { _id: -1 } },
        { $limit: 1 },
      ])
      .next();

    if (!latestDoc) {
      return new Response(JSON.stringify({ error: "No data available" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Three period anchors: the current window is (t1 → t0); the previous
    // window it is compared against is (t2 → t1).
    const t0 = latestDoc._id;

    let t1 = await latestPeriod(
      collection,
      new Date(new Date(t0).getTime() - windowMs)
    );
    // Not enough history for a full window back → fall back to the period
    // immediately before the latest so we can still show a comparison.
    const usedFallback = !t1;
    if (usedFallback) {
      t1 = await latestPeriod(collection, new Date(new Date(t0).getTime() - 1));
    }

    const t2 = t1
      ? await latestPeriod(
          collection,
          new Date(new Date(t1).getTime() - windowMs)
        )
      : null;

    // Energy consumed (kWh) in the current window and the prior one.
    const [current, previous] = await Promise.all([
      windowUsageKwh(collection, t1, t0),
      windowUsageKwh(collection, t2, t1),
    ]);

    const currentKwh  = current  ?? 0;
    const previousKwh = previous ?? 0;
    const pctChange =
      previousKwh !== 0 ? ((currentKwh - previousKwh) / previousKwh) * 100 : 0;

    return new Response(
      JSON.stringify({
        current:           parseFloat(currentKwh.toFixed(2)),
        previous:          parseFloat(previousKwh.toFixed(2)),
        pctChange:         parseFloat(pctChange.toFixed(1)),
        unit:              "kWh",
        windowLabel:       WINDOW_LABELS[windowKey] ?? WINDOW_LABELS["1h"],
        usedFallback:      usedFallback || previous == null,
        latestTimestamp:   t0,
        previousTimestamp: t1,
        priorTimestamp:    t2,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error fetching usage change:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
