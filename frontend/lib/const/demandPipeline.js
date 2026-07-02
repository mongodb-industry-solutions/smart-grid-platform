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
  const { states = [], feeders = [], meterIds = [] } = selection;
  const stages = [];

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
          {
            $setWindowFields: {
              sortBy: { timestamp: 1 },
              output: { prev_energy: { $shift: { output: "$energy", by: -1 } } },
            },
          },
          { $match: { prev_energy: { $ne: null } } },
          {
            $set: {
              // kWh used in the 15-min interval → average kW during it (×4).
              demand_kw: {
                $multiply: [
                  { $max: [{ $subtract: ["$energy", "$prev_energy"] }, 0] },
                  4,
                ],
              },
            },
          },
          { $project: { _id: 0, timestamp: 1, demand_kw: 1 } },
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
