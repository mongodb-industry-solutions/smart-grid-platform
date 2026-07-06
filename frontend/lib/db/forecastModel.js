import { buildDemandPipeline } from "@/lib/const/demandPipeline";

const READINGS = process.env.READINGS_COLLECTION_NAME || "readings";
const NETWORK_MAP = process.env.NETWORK_MAP_COLLECTION_NAME || "meter_network_map";

function strId(doc) {
  if (doc && doc._id != null) doc._id = doc._id.toString?.() ?? doc._id;
  return doc;
}

const TITLES = {
  demand: "Regional Demand Forecast",
};

/**
 * Documents + the aggregation pipeline behind the forecasting view. The demand
 * aggregation runs on meter_network_map and $lookups readings.
 *
 * @param {import("mongodb").Db} db
 * @param {string} component
 */
export async function getForecastComponentModel(db, component) {
  if (component !== "demand") return null;

  const sample = async (name, sort) => {
    const doc = await db.collection(name).findOne({}, sort ? { sort } : {});
    return { name, sample: doc ? strId(doc) : null };
  };

  const collections = [
    await sample(NETWORK_MAP),
    await sample(READINGS, { timestamp: -1 }),
  ];

  const operations = [
    {
      title: "Expected demand by region per hour",
      collection: NETWORK_MAP,
      type: "aggregate",
      pipeline: buildDemandPipeline({}),
    },
  ];

  return { title: TITLES[component], component, collections, operations };
}
