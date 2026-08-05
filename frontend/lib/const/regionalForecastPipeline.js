// Side-effect-free builders for the regional demand-forecast feature. Kept pure
// so the same code runs on the server (to query) and on the client (to render
// the pipeline in the PipelineCard). Mirrors lib/const/demandPipeline.js, but
// groups to the raw per-period series per region (no $hour rollup) so a JS
// seasonal model can build a distinct historical + forecast line per region.
const READINGS_COLLECTION =
  process.env.NEXT_PUBLIC_READINGS_COLLECTION_NAME ||
  process.env.READINGS_COLLECTION_NAME ||
  "readings";

// A "region" is a node in the grid hierarchy. The chosen granularity only
// changes which meter_network_map field we group demand by (and which id we
// look capacity up on in the `network` collection).
export const LEVEL_FIELD = {
  utility: "utility_id",
  substation: "substation_id",
  feeder: "feeder_id",
};

export function regionFieldFor(level) {
  return LEVEL_FIELD[level] || LEVEL_FIELD.feeder;
}

// dataid is stored as a number; selections arrive as text.
export function toDataidNumbers(ids) {
  return (ids ?? [])
    .map((v) => Number(v))
    .filter((v) => !Number.isNaN(v));
}

/**
 * Coincident demand per region per 15-min period. Runs on meter_network_map:
 * narrows by parent scope → chosen level → optional meters, then $lookups each
 * meter's readings, derives interval demand_kw from the cumulative energy
 * register, and sums it per {region, period}.
 *
 * @param {Object} sel
 * @param {"utility"|"substation"|"feeder"} [sel.level="feeder"]
 * @param {string[]} [sel.regionIds] ids at the chosen level (empty = all)
 * @param {{states?:string[],utilities?:string[],substations?:string[]}} [sel.parentScope]
 * @param {(string|number)[]} [sel.meterIds]
 * @param {Date} [sel.from] inclusive lower bound on reading timestamp
 * @param {Date} [sel.to] inclusive upper bound on reading timestamp
 */
export function buildRegionalForecastPipeline(sel = {}) {
  const {
    level = "feeder",
    regionIds = [],
    parentScope = {},
    meterIds = [],
    from,
    to,
  } = sel;
  const field = regionFieldFor(level);
  const { states = [], utilities = [], substations = [] } = parentScope;

  const stages = [];

  // 1) Narrowing $match stages (parent scope → chosen level → meters).
  if (states.length) stages.push({ $match: { state: { $in: states } } });
  if (utilities.length)
    stages.push({ $match: { utility_id: { $in: utilities } } });
  if (substations.length)
    stages.push({ $match: { substation_id: { $in: substations } } });
  if (regionIds.length) stages.push({ $match: { [field]: { $in: regionIds } } });
  if (meterIds.length)
    stages.push({ $match: { dataid: { $in: toDataidNumbers(meterIds) } } });

  // Time-window + real-reading guard, pushed into the $lookup for index use.
  // voltage != null excludes partial "heartbeat"/sim docs that would corrupt
  // the energy delta (see the readings-data-window note).
  const readingsMatch = { voltage: { $ne: null } };
  if (from || to) {
    readingsMatch.timestamp = {};
    if (from) readingsMatch.timestamp.$gte = from;
    if (to) readingsMatch.timestamp.$lte = to;
  }

  // 2) Pull each matched meter's readings and derive interval demand.
  stages.push(
    {
      $lookup: {
        from: READINGS_COLLECTION,
        localField: "dataid",
        foreignField: "dataid",
        as: "readings",
        pipeline: [
          { $match: readingsMatch },
          // Demand (kW) = the instantaneous `power` each reading carries. Using it
          // directly avoids a per-meter $setWindowFields over the full history,
          // keeping the forecast fast at scale (matches the energy-derived value).
          { $project: { _id: 0, timestamp: 1, demand_kw: { $divide: ["$power", 1000] } } },
        ],
      },
    },
    { $unwind: "$readings" },

    // 3) Coincident regional demand at each period.
    {
      $group: {
        _id: { region: `$${field}`, period: "$readings.timestamp" },
        demand_kw: { $sum: "$readings.demand_kw" },
      },
    },
    { $sort: { "_id.region": 1, "_id.period": 1 } }
  );

  return stages;
}

/**
 * Each region node's own rated capacity, from the `network` collection. Every
 * hierarchy level (utility/substation/feeder) has its own capacity_kw + name,
 * so we join directly on asset_id rather than summing children.
 *
 * @param {{ regionIds?: string[] }} [sel]
 */
export function buildRegionCapacityPipeline(sel = {}) {
  const { regionIds = [] } = sel;
  const stages = [];
  if (regionIds.length) stages.push({ $match: { asset_id: { $in: regionIds } } });
  stages.push({
    $project: {
      _id: 0,
      region: "$asset_id",
      capacity_kw: 1,
      name: 1,
      asset_type: 1,
      city: 1,
    },
  });
  return stages;
}
