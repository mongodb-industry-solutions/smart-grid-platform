const READINGS_COLLECTION_NAME =
  process.env.READINGS_COLLECTION_NAME || "readings";

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

// Native reading cadence (ms) and how many periods before the latest the walk
// starts, so periodIndex 0 lands on RECENT data (which has baseline history)
// rather than the oldest period (no prior baseline → nothing to flag).
const CADENCE_MS = 15 * 60 * 1000;
const START_BACK = 48;

// Default sigma multiple above which a metric is flagged as anomalous.
const DEFAULT_THRESHOLD = 3;

/**
 * Detects per-meter reading anomalies entirely in the database.
 *
 * For each meter (dataid) the latest reading is compared, metric by metric,
 * against the mean and sample standard deviation of that meter's prior readings
 * (its last-24h baseline — which, for this dataset, is its whole history
 * excluding the latest reading). A metric is flagged when its current value
 * deviates from the baseline mean by more than `threshold` standard deviations
 * (|value - mean| / std > threshold). One row is emitted per flagged
 * (meter, metric) pair, most extreme first.
 *
 * Metrics with a zero/undefined std, or meters with fewer than MIN_BASELINE
 * baseline readings, are skipped.
 *
 * @param {import("mongodb").Db} db connected MongoDB database handle
 * @param {object} [options]
 * @param {number} [options.threshold=3] sigma multiple above which a metric is flagged
 * @param {string[]} [options.metrics] metric field names to evaluate; defaults to DEFAULT_METRICS
 * @returns {Promise<Array<{
 *   meterId: number,
 *   metric: string,
 *   value: number,
 *   mean: number,
 *   std: number,
 *   sigma: number,
 *   timestamp: Date
 * }>>} flagged anomalies, highest sigma first
 */
export async function getAnomalies(
  db,
  { threshold = DEFAULT_THRESHOLD, metrics = DEFAULT_METRICS, periodIndex = null } = {}
) {
  const readings = db.collection(READINGS_COLLECTION_NAME);

  // Only allow known metric fields (avoids injecting arbitrary field names).
  const monitored = metrics.filter((m) => DEFAULT_METRICS.includes(m));

  // Resolve which reading is "under test". Anchor to the latest period (indexed,
  // fast) and, when a periodIndex is given, walk forward from START_BACK periods
  // ago on the uniform cadence grid — clamped to the latest — so the view advances
  // over recent data like the live chart instead of starting 30 days back.
  const latestDoc = await readings.findOne(
    { voltage: { $ne: null } },
    { projection: { _id: 0, timestamp: 1 }, sort: { timestamp: -1 } }
  );
  if (!latestDoc) return [];
  const latest = new Date(latestDoc.timestamp).getTime();
  let targetTs;
  if (periodIndex == null) {
    targetTs = new Date(latest);
  } else {
    const t = Math.min(latest, latest - (START_BACK - periodIndex) * CADENCE_MS);
    targetTs = new Date(t);
  }

  // One descriptor per metric, reading the per-meter stats computed in $group.
  const metricDescriptors = monitored.map((metric) => ({
    metric,
    value: `$test_${metric}`,
    mean: `$mean_${metric}`,
    std: `$std_${metric}`,
    timestamp: targetTs,
  }));

  // Per-meter accumulators: mean/std of each metric over the baseline window plus
  // the value of the reading under test (the row at targetTs). Using $group
  // accumulators — instead of $push-ing whole docs and re-scanning arrays — keeps
  // this fast on large collections. (The test row is included in the mean/std; at
  // ~1 of hundreds of points its effect is negligible.)
  const isTest = { $eq: ["$timestamp", targetTs] };
  const groupStage = {
    _id: "$dataid",
    n: { $sum: 1 },
    hasTest: { $max: { $cond: [isTest, 1, 0] } },
  };
  for (const m of monitored) {
    groupStage[`mean_${m}`] = { $avg: `$${m}` };
    groupStage[`std_${m}`] = { $stdDevSamp: `$${m}` };
    groupStage[`test_${m}`] = { $max: { $cond: [isTest, `$${m}`, null] } };
  }

  // Baseline window: only the recent history up to the reading under test — a few
  // days is plenty for a mean/std baseline, and it bounds the scan.
  const BASELINE_LOOKBACK_MS = 2 * 86_400_000;
  const windowStart = new Date(new Date(targetTs).getTime() - BASELINE_LOOKBACK_MS);

  const pipeline = [
    // Real readings within the baseline window, up to (and including) the test row.
    // voltage != null excludes partial "heartbeat" docs.
    { $match: { voltage: { $ne: null }, timestamp: { $gte: windowStart, $lte: targetTs } } },

    // Per-meter mean/std + the test row's values, without materializing arrays.
    { $group: groupStage },

    // Only meters with a reading at the target timestamp and enough baseline points.
    { $match: { hasTest: 1, n: { $gte: MIN_BASELINE + 1 } } },

    // Fan out into one row per monitored metric.
    { $set: { metrics: metricDescriptors } },
    { $unwind: "$metrics" },

    // Deviation in sigma units. Null when std is 0/missing or value is missing,
    // so those rows are dropped by the threshold match below.
    {
      $set: {
        "metrics.sigma": {
          $cond: [
            {
              $and: [
                { $gt: ["$metrics.std", 0] },
                { $ne: ["$metrics.value", null] },
                { $ne: ["$metrics.mean", null] },
              ],
            },
            {
              $divide: [
                { $abs: { $subtract: ["$metrics.value", "$metrics.mean"] } },
                "$metrics.std",
              ],
            },
            null,
          ],
        },
      },
    },

    // Keep metrics above the threshold; threshold <= 0 shows all valid rows.
    {
      $match: {
        "metrics.sigma": threshold > 0 ? { $gt: threshold } : { $ne: null },
      },
    },

    {
      $project: {
        _id: 0,
        meterId: "$_id",
        metric: "$metrics.metric",
        value: "$metrics.value",
        mean: "$metrics.mean",
        std: "$metrics.std",
        sigma: "$metrics.sigma",
        timestamp: "$metrics.timestamp",
      },
    },

    { $sort: { sigma: -1 } },
  ];

  return readings.aggregate(pipeline).toArray();
}
