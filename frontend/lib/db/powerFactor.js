const READINGS_COLLECTION_NAME =
  process.env.READINGS_COLLECTION_NAME || "readings";

function round(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Average power factor across all meters for the most recent reading period.
 * Power factor (0–1) is a power-quality metric; lower values mean less
 * efficient delivery. Also returns the worst (lowest) meter and sample size.
 *
 * @param {import("mongodb").Db} db connected MongoDB database handle
 * @returns {Promise<{
 *   powerFactor: number|null, min: number|null,
 *   sampleSize: number, timestamp: Date|null
 * }>}
 */
export async function getPowerFactor(db) {
  const readings = db.collection(READINGS_COLLECTION_NAME);

  const latest = await readings
    .aggregate([
      { $group: { _id: "$timestamp" } },
      { $sort: { _id: -1 } },
      { $limit: 1 },
    ])
    .next();

  if (!latest) {
    return { powerFactor: null, min: null, sampleSize: 0, timestamp: null };
  }

  const [agg] = await readings
    .aggregate([
      { $match: { timestamp: latest._id } },
      {
        $group: {
          _id: null,
          avg: { $avg: "$power_factor" },
          min: { $min: "$power_factor" },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  return {
    powerFactor: agg?.avg != null ? round(agg.avg) : null,
    min: agg?.min != null ? round(agg.min) : null,
    sampleSize: agg?.count ?? 0,
    timestamp: latest._id,
  };
}
