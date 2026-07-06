const READINGS = process.env.READINGS_COLLECTION_NAME || "readings";
const CUSTOMERS = process.env.CUSTOMERS_COLLECTION_NAME || "customer_db";
const NETWORK_MAP = process.env.NETWORK_MAP_COLLECTION_NAME || "meter_network_map";
const NETWORK = process.env.NETWORK_COLLECTION_NAME || "network";

function strId(doc) {
  if (doc && doc._id != null) doc._id = doc._id.toString?.() ?? doc._id;
  return doc;
}

const TITLES = {
  usage: "Usage Change",
  "power-factor": "Power Factor",
  "grid-stability": "Grid Stability",
  outages: "Outages",
  "customer-map": "Customer Map",
  readings: "Recent Readings",
  "readings-chart": "Live Readings Chart",
  anomalies: "Anomalies",
};

const OUTAGE_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Documents + operations (queries/pipelines) behind ONE component of the
 * monitoring panel. Monitoring is a global view, so there is no customer id.
 * Sample documents are real; operations mirror the real queries.
 *
 * @param {import("mongodb").Db} db
 * @param {string} component one of the keys in TITLES
 */
export async function getMonitoringComponentModel(db, component) {
  const sample = async (name, sort) => {
    const doc = await db.collection(name).findOne({}, sort ? { sort } : {});
    return { name, sample: doc ? strId(doc) : null };
  };

  // A representative period for pipelines that match a single timestamp.
  const latest = await db
    .collection(READINGS)
    .findOne({}, { sort: { timestamp: -1 }, projection: { timestamp: 1 } });
  const latestTs = latest?.timestamp
    ? latest.timestamp.toISOString?.() ?? latest.timestamp
    : "<latest period>";

  let collections = [];
  let operations = [];

  switch (component) {
    case "usage": {
      collections = [await sample(READINGS, { timestamp: -1 })];
      operations = [
        {
          title: "Total demand per period (compare recent)",
          collection: READINGS,
          type: "aggregate",
          pipeline: [
            { $group: { _id: "$timestamp", total_power: { $sum: "$power" } } },
            { $sort: { _id: -1 } },
            { $limit: 2 },
          ],
        },
      ];
      break;
    }
    case "power-factor": {
      collections = [await sample(READINGS, { timestamp: -1 })];
      operations = [
        {
          title: "Latest reading period",
          collection: READINGS,
          type: "aggregate",
          pipeline: [{ $group: { _id: "$timestamp" } }, { $sort: { _id: -1 } }, { $limit: 1 }],
        },
        {
          title: "Average / min power factor at that period",
          collection: READINGS,
          type: "aggregate",
          pipeline: [
            { $match: { timestamp: latestTs } },
            { $group: { _id: null, powerFactor: { $avg: "$power_factor" }, min: { $min: "$power_factor" }, count: { $sum: 1 } } },
          ],
        },
      ];
      break;
    }
    case "grid-stability": {
      collections = [await sample(READINGS, { timestamp: -1 }), await sample(NETWORK_MAP), await sample(NETWORK)];
      operations = [
        {
          title: "Feeder load vs capacity",
          collection: READINGS,
          type: "aggregate",
          pipeline: [
            { $match: { timestamp: latestTs } },
            { $lookup: { from: NETWORK_MAP, localField: "dataid", foreignField: "dataid", as: "map" } },
            { $unwind: "$map" },
            { $group: { _id: "$map.feeder_id", total_load: { $sum: "$avg_reading" }, meter_count: { $sum: 1 } } },
            { $lookup: { from: NETWORK, localField: "_id", foreignField: "asset_id", as: "network" } },
            { $unwind: "$network" },
            {
              $project: {
                _id: 0,
                feeder_id: "$_id",
                total_load: 1,
                capacity_kw: "$network.capacity_kw",
                utilization_pct: { $multiply: [{ $divide: ["$total_load", "$network.capacity_kw"] }, 100] },
              },
            },
            { $sort: { utilization_pct: -1 } },
          ],
        },
      ];
      break;
    }
    case "outages": {
      collections = [await sample(READINGS, { timestamp: -1 }), await sample(CUSTOMERS)];
      operations = [
        {
          title: "Outage summary (facet + gaps & islands)",
          collection: READINGS,
          type: "aggregate",
          pipeline: [
            { $match: { power: { $lte: 0 } } },
            {
              $facet: {
                totals: [{ $count: "totalOutages" }],
                customersWithOutage: [
                  { $group: { _id: "$dataid" } },
                  { $lookup: { from: CUSTOMERS, localField: "_id", foreignField: "dataid", as: "customer" } },
                  { $match: { customer: { $ne: [] } } },
                  { $count: "count" },
                ],
                longestOutage: [
                  { $setWindowFields: { partitionBy: "$dataid", sortBy: { timestamp: 1 }, output: { prevTimestamp: { $shift: { output: "$timestamp", by: -1 } } } } },
                  { $set: { isNewSession: { $cond: [{ $gt: [{ $subtract: ["$timestamp", "$prevTimestamp"] }, OUTAGE_INTERVAL_MS] }, 1, 0] } } },
                  { $setWindowFields: { partitionBy: "$dataid", sortBy: { timestamp: 1 }, output: { sessionId: { $sum: "$isNewSession", window: { documents: ["unbounded", "current"] } } } } },
                  { $group: { _id: { dataid: "$dataid", sessionId: "$sessionId" }, start: { $min: "$timestamp" }, end: { $max: "$timestamp" } } },
                  { $set: { durationMs: { $add: [{ $subtract: ["$end", "$start"] }, OUTAGE_INTERVAL_MS] } } },
                  { $sort: { durationMs: -1 } },
                  { $limit: 1 },
                ],
              },
            },
          ],
        },
      ];
      break;
    }
    case "customer-map": {
      collections = [await sample(CUSTOMERS), await sample(READINGS, { timestamp: -1 })];
      operations = [
        {
          title: "Customers per city",
          collection: CUSTOMERS,
          type: "aggregate",
          pipeline: [{ $group: { _id: { city: "$city", state: "$state" }, customers: { $sum: 1 } } }],
        },
        {
          title: "Distinct customers with an outage per city",
          collection: READINGS,
          type: "aggregate",
          pipeline: [
            { $match: { power: { $lte: 0 } } },
            { $lookup: { from: CUSTOMERS, localField: "dataid", foreignField: "dataid", as: "customer" } },
            { $match: { "customer.0": { $exists: true } } },
            { $group: { _id: { city: { $arrayElemAt: ["$customer.city", 0] }, state: { $arrayElemAt: ["$customer.state", 0] } }, meters: { $addToSet: "$dataid" } } },
            { $set: { outages: { $size: "$meters" } } },
          ],
        },
      ];
      break;
    }
    case "readings":
    case "readings-chart": {
      collections = [await sample(READINGS, { timestamp: -1 })];
      operations = [
        {
          title: "Nth reading period",
          collection: READINGS,
          type: "aggregate",
          pipeline: [{ $group: { _id: "$timestamp" } }, { $sort: { _id: 1 } }, { $skip: 0 }, { $limit: 1 }],
        },
        {
          title: "Readings at that period",
          collection: READINGS,
          type: "find",
          filter: { timestamp: latestTs },
          projection: { _id: 0, dataid: 1, timestamp: 1, power: 1, voltage: 1, current: 1 },
          sort: { dataid: 1 },
        },
      ];
      break;
    }
    case "anomalies": {
      collections = [await sample(READINGS, { timestamp: -1 })];
      operations = [
        {
          title: "3σ deviation vs each meter's own baseline",
          collection: READINGS,
          type: "aggregate",
          pipeline: [
            { $sort: { dataid: 1, timestamp: 1 } },
            { $group: { _id: "$dataid", readings: { $push: "$$ROOT" } } },
            { $set: { latest: { $last: "$readings" }, baseline: { $slice: ["$readings", 0, { $subtract: [{ $size: "$readings" }, 1] }] } } },
            { $set: { mean: { $avg: "$baseline.power" }, std: { $stdDevSamp: "$baseline.power" } } },
            { $set: { sigma: { $divide: [{ $abs: { $subtract: ["$latest.power", "$mean"] } }, "$std"] } } },
            { $match: { sigma: { $ne: null } } },
            { $sort: { sigma: -1 } },
          ],
        },
      ];
      break;
    }
    default:
      return null;
  }

  return { title: TITLES[component] || "MongoDB", component, collections, operations };
}
