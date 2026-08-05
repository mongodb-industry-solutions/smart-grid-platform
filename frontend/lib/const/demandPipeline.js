// Shared, side-effect-free builder for the demand aggregation pipeline. Used on
// the server to run the query and on the client to render it instantly in the
// card (it's a pure function of the filter selection, so no round-trip needed).
// Also reads the NEXT_PUBLIC_* var so the client-rendered pipeline matches the
// server's $lookup target when the collection name is overridden via env.
const READINGS_COLLECTION =
  process.env.NEXT_PUBLIC_READINGS_COLLECTION_NAME ||
  process.env.READINGS_COLLECTION_NAME ||
  "readings";

// dataid is stored as a number; selections arrive as text.
function toDataidNumbers(ids) {
  return (ids ?? [])
    .map((v) => Number(v))
    .filter((v) => !Number.isNaN(v));
}

/**
 * Builds the expected-demand pipeline PROGRESSIVELY from the user's filters
 * (region-first drill-down): each active filter adds a readable `$match` that
 * narrows the previous scope (region → feeder → meter). Runs on
 * meter_network_map, then $lookups each meter's readings and computes expected
 * demand by hour.
 *
 * @param {{ states?: string[], feeders?: string[], meterIds?: (string|number)[] }} selection
 */
export function buildDemandPipeline(selection = {}) {
  const { states = [], feeders = [], meterIds = [], from, to } = selection;
  const stages = [];

  // Time bound on the readings scan (keeps the $lookup fast on large collections).
  const readingsMatch = {};
  if (from || to) {
    readingsMatch.timestamp = {};
    if (from) readingsMatch.timestamp.$gte = from;
    if (to) readingsMatch.timestamp.$lte = to;
  }

  // 1) Narrowing filters — one stage per active filter (region → feeder → meter).
  if (states.length) stages.push({ $match: { state: { $in: states } } });
  if (feeders.length) stages.push({ $match: { feeder_id: { $in: feeders } } });
  if (meterIds.length)
    stages.push({ $match: { dataid: { $in: toDataidNumbers(meterIds) } } });

  // 2) Pull each matched meter's readings and derive its interval consumption.
  stages.push(
    {
      $lookup: {
        from: READINGS_COLLECTION,
        localField: "dataid",
        foreignField: "dataid",
        as: "readings",
        pipeline: [
          ...(readingsMatch.timestamp ? [{ $match: readingsMatch }] : []),
          // Demand (kW) is the instantaneous `power` (W) each reading already
          // carries. Using it directly avoids a per-meter $setWindowFields over
          // the full history, keeping this fast at scale (and it matches the
          // energy-derived value, since energy accrues as power × interval).
          { $project: { _id: 0, timestamp: 1, demand_kw: { $divide: ["$power", 1000] } } },
        ],
      },
    },
    { $unwind: "$readings" },

    // 3) Coincident regional demand at each period.
    {
      $group: {
        _id: { region: "$state", period: "$readings.timestamp" },
        demand_kw: { $sum: "$readings.demand_kw" },
      },
    },

    // 4) Expected demand per region per hour of day, with variability.
    {
      $group: {
        _id: { region: "$_id.region", hour: { $hour: "$_id.period" } },
        expected_kw: { $avg: "$demand_kw" },
        std_dev: { $stdDevSamp: "$demand_kw" },
        samples: { $sum: 1 },
      },
    },
    { $sort: { "_id.region": 1, "_id.hour": 1 } }
  );

  return stages;
}
