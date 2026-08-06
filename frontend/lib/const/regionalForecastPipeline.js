// Side-effect-free builders for the regional demand-forecast feature. Kept pure
// so the same code runs on the server (to query) and on the client (to render
// the pipeline in the PipelineCard). Mirrors lib/const/demandPipeline.js, but
// groups to the raw per-period series per region (no $hour rollup) so a JS
// seasonal model can build a distinct historical + forecast line per region.
//
// Runs directly on `readings` (the grid hierarchy + region are denormalized onto
// every reading), so there is NO $lookup — just a single-collection $match + $group.

// A "region" is a node in the grid hierarchy. The chosen granularity only
// changes which (denormalized) reading field we group demand by (and which id we
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
 * Coincident demand per region per period. Runs on `readings`: narrows by parent
 * scope → chosen level → optional meters (all denormalized reading fields), then
 * sums the instantaneous demand per {region, period}.
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

  // voltage != null excludes partial "heartbeat"/sim docs that would corrupt the
  // demand series (see the readings-data-window note). Every other filter maps to
  // a field already on the reading, so no join is needed.
  const match = { voltage: { $ne: null } };
  if (states.length) match.state = { $in: states };
  if (utilities.length) match.utility_id = { $in: utilities };
  if (substations.length) match.substation_id = { $in: substations };
  if (regionIds.length) match[field] = { $in: regionIds };
  if (meterIds.length) match.dataid = { $in: toDataidNumbers(meterIds) };
  if (from || to) {
    match.timestamp = {};
    if (from) match.timestamp.$gte = from;
    if (to) match.timestamp.$lte = to;
  }

  return [
    { $match: match },
    // Coincident regional demand at each period (kW = instantaneous power).
    {
      $group: {
        _id: { region: `$${field}`, period: "$timestamp" },
        demand_kw: { $sum: { $divide: ["$power", 1000] } },
      },
    },
    { $sort: { "_id.region": 1, "_id.period": 1 } },
  ];
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
