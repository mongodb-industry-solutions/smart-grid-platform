// Shared, side-effect-free builder for the demand aggregation pipeline. Used on
// the server to run the query and on the client to render it instantly in the
// card (it's a pure function of the filter selection, so no round-trip needed).
//
// Runs directly on `readings`: the grid hierarchy (utility/substation/feeder ids)
// and the region (`state`) are denormalized onto every reading, so demand is a
// single-collection $match + $group with NO $lookup/join.

// dataid is stored as a number; selections arrive as text.
function toDataidNumbers(ids) {
  return (ids ?? [])
    .map((v) => Number(v))
    .filter((v) => !Number.isNaN(v));
}

/**
 * Builds the expected-demand pipeline from the user's filters (region-first
 * drill-down: region → feeder → meter), plus an optional time window. Runs on
 * `readings` and computes expected demand by hour of day per region.
 *
 * @param {{ states?: string[], feeders?: string[], meterIds?: (string|number)[], from?: Date, to?: Date }} selection
 */
export function buildDemandPipeline(selection = {}) {
  const { states = [], feeders = [], meterIds = [], from, to } = selection;

  // All filters map to fields already on each reading — no join needed. The
  // voltage != null guard excludes partial "heartbeat"/sim docs that would
  // otherwise inflate demand at the current timestamp.
  const match = { voltage: { $ne: null } };
  if (states.length) match.state = { $in: states };
  if (feeders.length) match.feeder_id = { $in: feeders };
  if (meterIds.length) match.dataid = { $in: toDataidNumbers(meterIds) };
  if (from || to) {
    match.timestamp = {};
    if (from) match.timestamp.$gte = from;
    if (to) match.timestamp.$lte = to;
  }

  return [
    { $match: match },

    // 1) Coincident regional demand at each period. Demand (kW) is the
    //    instantaneous `power` (W) each reading already carries.
    {
      $group: {
        _id: { region: "$state", period: "$timestamp" },
        demand_kw: { $sum: { $divide: ["$power", 1000] } },
      },
    },

    // 2) Expected demand per region per hour of day, with variability.
    {
      $group: {
        _id: { region: "$_id.region", hour: { $hour: "$_id.period" } },
        expected_kw: { $avg: "$demand_kw" },
        std_dev: { $stdDevSamp: "$demand_kw" },
        samples: { $sum: 1 },
      },
    },
    { $sort: { "_id.region": 1, "_id.hour": 1 } },
  ];
}
