const READINGS_COLLECTION_NAME =
  process.env.READINGS_COLLECTION_NAME || "readings";
const LATEST_READINGS_COLLECTION = "latest_readings";

// Metrics evaluated for anomalies. avg_reading is omitted (duplicate of
// voltage); volt_leg_1/2 are omitted as they overlap with voltage.
const DEFAULT_METRICS = [
  "voltage",
  "current",
  "power",
  "power_factor",
  "frequency",
];

// A meter needs at least this many baseline (non-latest) readings before its
// mean/std are trustworthy enough to flag anomalies.
const MIN_BASELINE = 3;

// Default sigma multiple above which a metric is flagged as anomalous.
const DEFAULT_THRESHOLD = 3;

// Baseline window: recent history for computing mean/std per meter.
const BASELINE_LOOKBACK_MS = 2 * 86_400_000;

/**
 * Detects per-meter reading anomalies by comparing the latest reading (from
 * latest_readings) against a baseline mean/std computed from the time-series
 * readings collection.
 *
 * This approach works with any feeder cadence — it doesn't depend on readings
 * landing on a fixed 15-minute grid.
 *
 * @param {import("mongodb").Db} db connected MongoDB database handle
 * @param {object} [options]
 * @param {number} [options.threshold=3] sigma multiple above which a metric is flagged
 * @param {string[]} [options.metrics] metric field names to evaluate
 * @returns {Promise<Array<{
 *   meterId: number, metric: string, value: number,
 *   mean: number, std: number, sigma: number, timestamp: Date
 * }>>} flagged anomalies, highest sigma first
 */
export async function getAnomalies(
  db,
  { threshold = DEFAULT_THRESHOLD, metrics = DEFAULT_METRICS } = {}
) {
  const readings = db.collection(READINGS_COLLECTION_NAME);
  const latestCol = db.collection(LATEST_READINGS_COLLECTION);

  const monitored = metrics.filter((m) => DEFAULT_METRICS.includes(m));

  // Get the latest readings (one per meter) from the derived collection.
  const latestDocs = await latestCol.find({}).toArray();
  if (!latestDocs.length) return [];

  // Build a map of meterId -> latest reading for quick lookup.
  const latestByMeter = new Map(latestDocs.map((d) => [d._id, d]));
  const newestTs = latestDocs.reduce((max, d) => {
    const t = new Date(d.timestamp).getTime();
    return t > max ? t : max;
  }, 0);
  const windowStart = new Date(newestTs - BASELINE_LOOKBACK_MS);

  // Compute baseline mean/std per meter from the time-series collection.
  const groupStage = { _id: "$dataid", n: { $sum: 1 } };
  for (const m of monitored) {
    groupStage[`mean_${m}`] = { $avg: `$${m}` };
    groupStage[`std_${m}`] = { $stdDevSamp: `$${m}` };
  }

  const baselines = await readings
    .aggregate([
      { $match: { voltage: { $ne: null }, timestamp: { $gte: windowStart } } },
      { $group: groupStage },
      { $match: { n: { $gte: MIN_BASELINE + 1 } } },
    ])
    .toArray();

  // Compare each meter's latest reading against its baseline.
  const anomalies = [];
  for (const b of baselines) {
    const latest = latestByMeter.get(b._id);
    if (!latest) continue;

    for (const metric of monitored) {
      const value = latest[metric];
      const mean = b[`mean_${metric}`];
      const std = b[`std_${metric}`];

      if (value == null || mean == null || !std || std === 0) continue;

      const sigma = Math.abs(value - mean) / std;
      if (threshold > 0 && sigma <= threshold) continue;

      anomalies.push({
        meterId: b._id,
        metric,
        value: Math.round(value * 100) / 100,
        mean: Math.round(mean * 100) / 100,
        std: Math.round(std * 100) / 100,
        sigma: Math.round(sigma * 100) / 100,
        timestamp: latest.timestamp,
      });
    }
  }

  anomalies.sort((a, b) => b.sigma - a.sigma);
  return anomalies;
}
