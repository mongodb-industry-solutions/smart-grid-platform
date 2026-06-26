import getMongoClientPromise from "@/lib/mongodb";

const dbName = process.env.DATABASE_NAME;
const readingsCollectionName = process.env.READINGS_COLLECTION_NAME || "readings";

const WINDOW_MS = { "1h": 3_600_000, "6h": 21_600_000, "24h": 86_400_000 };
const WINDOW_LABELS = { "1h": "last hour", "6h": "last 6 hours", "24h": "last 24 hours" };

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const windowKey = searchParams.get("window") ?? "1h";
  const windowMs  = WINDOW_MS[windowKey] ?? WINDOW_MS["1h"];

  try {
    const mongoClient = await getMongoClientPromise();
    const db         = mongoClient.db(dbName);
    const collection = db.collection(readingsCollectionName);

    // Most recent distinct timestamp
    const latestDoc = await collection
      .aggregate([
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

    const latestTs  = latestDoc._id;
    const cutoffTs  = new Date(new Date(latestTs).getTime() - windowMs);

    // Most recent timestamp that falls at or before the cutoff (i.e. window ago)
    let previousDoc = await collection
      .aggregate([
        { $group: { _id: "$timestamp" } },
        { $match: { _id: { $lte: cutoffTs } } },
        { $sort:  { _id: -1 } },
        { $limit: 1 },
      ])
      .next();

    // If the dataset doesn't have that much history, fall back to second-to-latest period
    const usedFallback = !previousDoc;
    if (usedFallback) {
      previousDoc = await collection
        .aggregate([
          { $group: { _id: "$timestamp" } },
          { $sort:  { _id: -1 } },
          { $skip:  1 },
          { $limit: 1 },
        ])
        .next();
    }

    const previousTs = previousDoc?._id ?? null;

    // Average power demand (W) for both periods in parallel
    const [currentAgg, previousAgg] = await Promise.all([
      collection
        .aggregate([
          { $match: { timestamp: latestTs } },
          { $group: { _id: null, avg: { $avg: "$power" } } },
        ])
        .next(),
      previousTs
        ? collection
            .aggregate([
              { $match: { timestamp: previousTs } },
              { $group: { _id: null, avg: { $avg: "$power" } } },
            ])
            .next()
        : Promise.resolve(null),
    ]);

    const current  = currentAgg?.avg  ?? 0;
    const previous = previousAgg?.avg ?? 0;
    const pctChange =
      previous !== 0 ? ((current - previous) / previous) * 100 : 0;

    return new Response(
      JSON.stringify({
        current:           parseFloat(current.toFixed(2)),
        previous:          parseFloat(previous.toFixed(2)),
        pctChange:         parseFloat(pctChange.toFixed(1)),
        windowLabel:       WINDOW_LABELS[windowKey] ?? WINDOW_LABELS["1h"],
        usedFallback,
        latestTimestamp:   latestTs,
        previousTimestamp: previousTs,
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
