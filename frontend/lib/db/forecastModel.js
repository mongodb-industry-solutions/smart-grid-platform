import { buildDemandPipeline } from "@/lib/const/demandPipeline";
import {
  buildRegionalForecastPipeline,
  buildRegionCapacityPipeline,
} from "@/lib/const/regionalForecastPipeline";
import { buildWeatherForecastPipeline } from "@/lib/const/weatherForecastPipeline";

const READINGS = process.env.READINGS_COLLECTION_NAME || "readings";
const NETWORK = process.env.NETWORK_COLLECTION_NAME || "network";
const CUSTOMERS = process.env.CUSTOMERS_COLLECTION_NAME || "customer_db";

function strId(doc) {
  if (doc && doc._id != null) doc._id = doc._id.toString?.() ?? doc._id;
  return doc;
}

const TITLES = {
  demand: "Regional Demand Forecast",
  capacity: "Projected Demand vs Capacity",
  peak: "Peak Timing by Time Zone",
  weather: "Weather-Adjusted Energy Forecast",
};

/**
 * Documents + the aggregation pipeline behind each forecasting component.
 *  - "demand"   → expected demand by region per hour (bar-per-region view).
 *  - "capacity" → per-region per-period series + each region node's capacity_kw.
 *
 * @param {import("mongodb").Db} db
 * @param {string} component
 */
export async function getForecastComponentModel(db, component) {
  const sample = async (name, sort) => {
    const doc = await db.collection(name).findOne({}, sort ? { sort } : {});
    return { name, sample: doc ? strId(doc) : null };
  };

  if (component === "demand") {
    return {
      title: TITLES.demand,
      component,
      collections: [await sample(READINGS, { timestamp: -1 })],
      operations: [
        {
          title: "Expected demand by region per hour",
          collection: READINGS,
          type: "aggregate",
          pipeline: buildDemandPipeline({}),
        },
      ],
    };
  }

  if (component === "capacity") {
    return {
      title: TITLES.capacity,
      component,
      collections: [
        await sample(READINGS, { timestamp: -1 }),
        await sample(NETWORK),
      ],
      operations: [
        {
          title: "Coincident demand per region per period",
          collection: READINGS,
          type: "aggregate",
          pipeline: buildRegionalForecastPipeline({ level: "feeder" }),
        },
        {
          title: "Region capacity (rated capacity_kw per node)",
          collection: NETWORK,
          type: "aggregate",
          pipeline: buildRegionCapacityPipeline({}),
        },
      ],
    };
  }

  if (component === "peak") {
    return {
      title: TITLES.peak,
      component,
      collections: [await sample(READINGS, { timestamp: -1 })],
      operations: [
        {
          title: "Coincident demand per region per period (peak hour per region)",
          collection: READINGS,
          type: "aggregate",
          pipeline: buildRegionalForecastPipeline({ level: "feeder" }),
        },
      ],
    };
  }

  if (component === "weather") {
    let pipeline = [];
    try {
      // Representative pipeline; at runtime meterIds/from/to/tempArray come from
      // the selected region and the Open-Meteo forecast.
      pipeline = buildWeatherForecastPipeline({
        meterIds: [],
        from: new Date(0),
        to: new Date(),
        tempArray: [],
      });
    } catch {
      pipeline = [];
    }
    return {
      title: TITLES.weather,
      component,
      collections: [await sample(CUSTOMERS), await sample(READINGS, { timestamp: -1 })],
      operations: [
        {
          title: "Weather-adjusted hourly energy (heating/cooling degree days)",
          collection: READINGS,
          type: "aggregate",
          pipeline,
        },
      ],
    };
  }

  return null;
}
