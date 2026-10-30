import getMongoClientPromise from "@/lib/mongodb";
import { cached } from "@/lib/cache/ttlCache";

const dbName = process.env.DATABASE_NAME;
const readingsCollectionName = process.env.READINGS_COLLECTION_NAME || "readings";
const LIVE_TTL_MS = 5_000;

const WINDOW_MS = { "1h": 3_600_000, "6h": 21_600_000, "24h": 86_400_000 };
const WINDOW_LABELS = { "1h": "last hour", "6h": "last 6 hours", "24h": "last 24 hours" };

// A percentage change is only meaningful when the baseline window carries a
// real sample of the fleet. Below these bounds the denominator is too small or
// too sparse and the ratio explodes — e.g. a single low-consumption meter
// compared against the whole fleet reads as hundreds of thousands of percent.
const MIN_BASELINE_KWH = 1; // kWh consumed in the previous window
const MIN_BASELINE_METERS = 5; // meters that reported in the previous window
const MIN_COVERAGE_RATIO = 0.5; // previous/current meter count

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
// Non-positive deltas (meter resets/gaps) are ignored. Also returns how many
// meters contributed, so callers can judge whether the window is representative.
async function windowUsage(collection, fromTs, toTs) {
  if (!fromTs || !toTs) return { total: null, meters: 0 };
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
          meters: { $sum: 1 },
        },
      },
    ])
    .toArray();
  return { total: agg?.total ?? 0, meters: agg?.meters ?? 0 };
}

// Computes the usage-change payload. Returns null when there is no data at all.
async function computeUsageChange(db, windowKey, windowMs) {
  const collection = db.collection(readingsCollectionName);

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

  if (!latestDoc) return null;

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

  // Energy consumed (kWh) in the current window and the prior one, plus how
  // many meters reported in each.
  const [current, previous] = await Promise.all([
    windowUsage(collection, t1, t0),
    windowUsage(collection, t2, t1),
  ]);

  const currentKwh  = current.total  ?? 0;
  const previousKwh = previous.total ?? 0;

  // The spans actually compared, in minutes. These differ from the requested
  // window when we fell back to the immediately-previous reading period.
  const currentWindowMinutes = t1
    ? Math.round((new Date(t0).getTime() - new Date(t1).getTime()) / 60000)
    : null;
  const previousWindowMinutes = t2
    ? Math.round((new Date(t1).getTime() - new Date(t2).getTime()) / 60000)
    : null;

  // Only show a percentage when the baseline is a fair comparison: enough
  // consumption, enough meters, and comparable fleet coverage. Otherwise the
  // ratio is noise, so we withhold it and explain why.
  const coverageRatio =
    current.meters > 0 ? previous.meters / current.meters : 0;
  const comparable =
    previousKwh >= MIN_BASELINE_KWH &&
    previous.meters >= MIN_BASELINE_METERS &&
    coverageRatio >= MIN_COVERAGE_RATIO;

  let reason = null;
  if (!comparable) {
    if (previous.meters < MIN_BASELINE_METERS) {
      reason = `Only ${previous.meters} meter${
        previous.meters === 1 ? "" : "s"
      } reported in the previous window.`;
    } else if (previousKwh < MIN_BASELINE_KWH) {
      reason = "Previous window consumption was too low to compare.";
    } else if (coverageRatio < MIN_COVERAGE_RATIO) {
      reason = "The previous window covered far fewer meters than the current one.";
    } else {
      reason = "Not enough comparable history.";
    }
  }

  const pctChange = comparable
    ? ((currentKwh - previousKwh) / previousKwh) * 100
    : null;

  return {
    current:           parseFloat(currentKwh.toFixed(2)),
    previous:          parseFloat(previousKwh.toFixed(2)),
    pctChange:         pctChange === null ? null : parseFloat(pctChange.toFixed(1)),
    comparable,
    reason,
    unit:              "kWh",
    windowLabel:       WINDOW_LABELS[windowKey] ?? WINDOW_LABELS["1h"],
    currentMeters:     current.meters,
    previousMeters:    previous.meters,
    currentWindowMinutes,
    previousWindowMinutes,
    usedFallback:      usedFallback || previous.total == null,
    latestTimestamp:   t0,
    previousTimestamp: t1,
    priorTimestamp:    t2,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const windowKey = searchParams.get("window") ?? "1h";
  const windowMs  = WINDOW_MS[windowKey] ?? WINDOW_MS["1h"];

  try {
    const mongoClient = await getMongoClientPromise();
    const db          = mongoClient.db(dbName);

    const payload = await cached(`usage-change:${windowKey}`, LIVE_TTL_MS, () =>
      computeUsageChange(db, windowKey, windowMs)
    );

    if (!payload) {
      return new Response(JSON.stringify({ error: "No data available" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching usage change:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
