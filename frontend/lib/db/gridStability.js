const READINGS_COLLECTION = process.env.READINGS_COLLECTION_NAME || "readings";
const NETWORK_COLLECTION  = process.env.NETWORK_COLLECTION_NAME  || "network";

/**
 * Returns feeder load vs capacity for the Nth distinct timestamp in readings.
 *
 * Pipeline:
 *   1. Find the Nth distinct timestamp (periodIndex).
 *   2. Match all readings at that exact timestamp (all meters) and group by the
 *      feeder_id denormalized on each reading, summing avg_reading → total_load.
 *   3. Join network on feeder_id = asset_id → capacity_kw.
 *   4. Compute utilization_pct = total_load / capacity_kw × 100.
 *
 * @param {import("mongodb").Db} db
 * @param {number} periodIndex
 */
// Readings are on a uniform 15-min grid, so a period is located arithmetically
// off the latest timestamp (indexed) instead of scanning every distinct timestamp.
const CADENCE_MS = 15 * 60 * 1000;
const START_BACK = 48; // periodIndex 0 starts ~12h ago, then walks toward "now".

export async function getGridStability(db, periodIndex = 0) {
  const col = db.collection(READINGS_COLLECTION);

  // Step 1 — resolve the timestamp for this period. Anchor to the latest reading
  // (uses the timestamp index — fast) and walk forward from START_BACK periods
  // ago, clamped to the latest, so the card shows recent data (not 30 days old).
  const latestDoc = await col.findOne(
    { voltage: { $ne: null } },
    { projection: { _id: 0, timestamp: 1 }, sort: { timestamp: -1 } }
  );
  if (!latestDoc) return { feeders: [], summary: null };

  const latest = new Date(latestDoc.timestamp).getTime();
  const ts = new Date(Math.min(latest, latest - (START_BACK - periodIndex) * CADENCE_MS));

  // Steps 2–4 — feeder aggregation for this snapshot
  const feeders = await col.aggregate([
    { $match: { timestamp: ts, feeder_id: { $ne: null } } },

    // feeder_id is denormalized on each reading, so group directly — no join needed.
    {
      $group: {
        _id:         "$feeder_id",
        total_load:  { $sum: "$avg_reading" },
        meter_count: { $sum: 1 },
      },
    },

    // Join the feeder's network asset to compare load against its rated capacity.
    {
      $lookup: {
        from:         NETWORK_COLLECTION,
        localField:   "_id",
        foreignField: "asset_id",
        as:           "network",
      },
    },
    { $unwind: { path: "$network", preserveNullAndEmptyArrays: true } },

    {
      $project: {
        _id:         0,
        feeder_id:   "$_id",
        total_load:  { $round: ["$total_load", 2] },
        capacity_kw: { $ifNull: ["$network.capacity_kw", null] },
        meter_count: 1,
        utilization_pct: {
          $cond: {
            if:   { $gt: ["$network.capacity_kw", 0] },
            then: {
              $round: [
                { $multiply: [{ $divide: ["$total_load", "$network.capacity_kw"] }, 100] },
                1,
              ],
            },
            else: null,
          },
        },
      },
    },

    { $sort: { utilization_pct: -1 } },
  ]).toArray();

  const valid          = feeders.filter((f) => f.utilization_pct !== null);
  const total_load     = feeders.reduce((s, f) => s + f.total_load, 0);
  const total_capacity = feeders.reduce((s, f) => s + (f.capacity_kw ?? 0), 0);
  const peak           = valid[0] ?? null;

  return {
    feeders,
    timestamp: ts,
    summary: {
      total_load:          Math.round(total_load * 100) / 100,
      total_capacity,
      overall_utilization: total_capacity > 0
        ? Math.round((total_load / total_capacity) * 1000) / 10
        : null,
      peak_utilization: peak?.utilization_pct ?? null,
      peak_feeder_id:   peak?.feeder_id ?? null,
      feeders_normal:   valid.filter((f) => f.utilization_pct <  70).length,
      feeders_elevated: valid.filter((f) => f.utilization_pct >= 70 && f.utilization_pct < 90).length,
      feeders_critical: valid.filter((f) => f.utilization_pct >= 90).length,
    },
  };
}
