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

  // One descriptor per metric, built from the latest reading and the baseline.
  const metricDescriptors = monitored.map((metric) => ({
    metric,
    value: `$latest.${metric}`,
    mean: { $avg: `$baseline.${metric}` },
    std: { $stdDevSamp: `$baseline.${metric}` },
    timestamp: "$latest.timestamp",
  }));

  // Baseline window: only the recent history up to the reading under test. This
  // bounds the per-meter $push so the aggregation stays fast on large collections
  // — a few days of readings is plenty for a mean/std baseline.
  const BASELINE_LOOKBACK_MS = 2 * 86_400_000;
  const windowStart = new Date(new Date(targetTs).getTime() - BASELINE_LOOKBACK_MS);

  const pipeline = [
    // Ignore partial "heartbeat" docs (only power/energy at a current timestamp)
    // so a meter's latest reading under test is always a real reading. Bounded to
    // the baseline window (and never past the reading under test).
    { $match: { voltage: { $ne: null }, timestamp: { $gte: windowStart, $lte: targetTs } } },
    { $sort: { dataid: 1, timestamp: 1 } },

    // Collect every reading per meter in chronological order.
    { $group: { _id: "$dataid", readings: { $push: "$$ROOT" } } },

    // The reading under test is the one at the target timestamp; the baseline is
    // that meter's other readings (its history).
    {
      $set: {
        latest: {
          $arrayElemAt: [
            {
              $filter: {
                input: "$readings",
                as: "r",
                cond: { $eq: ["$$r.timestamp", targetTs] },
              },
            },
            0,
          ],
        },
        baseline: {
          $filter: {
            input: "$readings",
            as: "r",
            cond: { $ne: ["$$r.timestamp", targetTs] },
          },
        },
      },
    },
    { $set: { baselineCount: { $size: "$baseline" } } },

    // Only meters that actually have a reading at the target timestamp, with
    // enough baseline readings to form a trustworthy mean/std.
    { $match: { latest: { $ne: null }, baselineCount: { $gte: MIN_BASELINE } } },

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
