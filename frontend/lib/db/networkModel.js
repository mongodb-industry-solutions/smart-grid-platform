const READINGS = process.env.READINGS_COLLECTION_NAME || "readings";
const NETWORK_MAP = process.env.NETWORK_MAP_COLLECTION_NAME || "meter_network_map";
const NETWORK = process.env.NETWORK_COLLECTION_NAME || "network";

function strId(doc) {
  if (doc && doc._id != null) doc._id = doc._id.toString?.() ?? doc._id;
  return doc;
}

const TITLES = {
  stability: "Live Grid Stability",
  health: "Substation Health",
  topology: "Grid Network Topology",
};

// The feeder load-vs-capacity pipeline that powers the Network Center — mirrors
// lib/db/gridStability.js. Groups readings by their denormalized feeder_id, then
// joins the `network` asset for each feeder's rated capacity_kw (no meter_network_map
// join needed, since feeder_id lives on every reading).
function gridStabilityPipeline(ts) {
  return [
    { $match: { timestamp: ts, feeder_id: { $ne: null } } },
    {
      $group: {
        _id: "$feeder_id",
        total_load: { $sum: "$avg_reading" },
        meter_count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: NETWORK,
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
  ];
}

// Walks the grid hierarchy (utility → substation → feeder → transformer) from
// the small `network` collection, attaching each transformer's meters.
function networkTreePipeline() {
  return [
    { $match: { asset_type: { $in: ["utility", "substation", "feeder", "transformer"] } } },
    {
      $lookup: {
        from: NETWORK_MAP,
        localField: "asset_id",
        foreignField: "feeder_id",
        as: "meters",
      },
    },
    { $sort: { asset_type: 1, asset_id: 1 } },
  ];
}

/**
 * Documents + the aggregation behind each Network Center component.
 *  - "stability" → live feeder load vs capacity.
 *  - "health"    → same join, scored per substation (utilization + anomalies).
 *  - "topology"  → the grid hierarchy from the network collection.
 *
 * @param {import("mongodb").Db} db
 * @param {string} component
 */
export async function getNetworkComponentModel(db, component) {
  const sample = async (name, sort) => {
    const doc = await db.collection(name).findOne({}, sort ? { sort } : {});
    return { name, sample: doc ? strId(doc) : null };
  };

  // Latest reading timestamp — the snapshot the live views aggregate over.
  const latest = await db
    .collection(READINGS)
    .find({ voltage: { $ne: null } }, { projection: { timestamp: 1 } })
    .sort({ timestamp: -1 })
    .limit(1)
    .next();
  const ts = latest?.timestamp ?? null;

  if (component === "stability" || component === "health") {
    return {
      title: component === "health" ? TITLES.health : TITLES.stability,
      component,
      collections: [
        await sample(READINGS, { timestamp: -1 }),
        await sample(NETWORK),
      ],
      operations: [
        {
          title: "Feeder load vs capacity (utilization %)",
          collection: READINGS,
          type: "aggregate",
          pipeline: gridStabilityPipeline(ts),
        },
      ],
    };
  }

  if (component === "topology") {
    return {
      title: TITLES.topology,
      component,
      collections: [await sample(NETWORK), await sample(NETWORK_MAP)],
      operations: [
        {
          title: "Grid hierarchy with meters per transformer",
          collection: NETWORK,
          type: "aggregate",
          pipeline: networkTreePipeline(),
        },
      ],
    };
  }

  return null;
}
