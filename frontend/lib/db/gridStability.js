const NETWORK_COLLECTION = process.env.NETWORK_COLLECTION_NAME || "network";
const LATEST_READINGS_COLLECTION = "latest_readings";

/**
 * Returns feeder load vs capacity from the latest readings.
 *
 * Reads from latest_readings (one doc per meter, updated every feeder tick)
 * instead of walking a periodIndex on the time-series collection. This works
 * with any feeder cadence (real-time or accelerated).
 *
 * @param {import("mongodb").Db} db
 */
export async function getGridStability(db) {
  const latest = db.collection(LATEST_READINGS_COLLECTION);

  const feeders = await latest.aggregate([
    { $match: { feeder_id: { $ne: null } } },

    {
      $group: {
        _id: "$feeder_id",
        total_load: { $sum: "$avg_reading" },
        meter_count: { $sum: 1 },
        timestamp: { $max: "$timestamp" },
      },
    },

    {
      $lookup: {
        from: NETWORK_COLLECTION,
        localField: "_id",
        foreignField: "asset_id",
        as: "network",
      },
    },
    { $unwind: { path: "$network", preserveNullAndEmptyArrays: true } },

    {
      $project: {
        _id: 0,
        feeder_id: "$_id",
        total_load: { $round: ["$total_load", 2] },
        capacity_kw: { $ifNull: ["$network.capacity_kw", null] },
        meter_count: 1,
        utilization_pct: {
          $cond: {
            if: { $gt: ["$network.capacity_kw", 0] },
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

  const valid = feeders.filter((f) => f.utilization_pct !== null);
  const total_load = feeders.reduce((s, f) => s + f.total_load, 0);
  const total_capacity = feeders.reduce((s, f) => s + (f.capacity_kw ?? 0), 0);
  const peak = valid[0] ?? null;

  // Get the most recent timestamp from the latest readings for the response.
  const newest = await latest.findOne({}, { projection: { timestamp: 1 }, sort: { timestamp: -1 } });

  return {
    feeders,
    timestamp: newest?.timestamp ?? null,
    summary: {
      total_load: Math.round(total_load * 100) / 100,
      total_capacity,
      overall_utilization: total_capacity > 0
        ? Math.round((total_load / total_capacity) * 1000) / 10
        : null,
      peak_utilization: peak?.utilization_pct ?? null,
      peak_feeder_id: peak?.feeder_id ?? null,
      feeders_normal: valid.filter((f) => f.utilization_pct < 70).length,
      feeders_elevated: valid.filter((f) => f.utilization_pct >= 70 && f.utilization_pct < 90).length,
      feeders_critical: valid.filter((f) => f.utilization_pct >= 90).length,
    },
  };
}
