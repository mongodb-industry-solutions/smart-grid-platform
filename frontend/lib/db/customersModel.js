import { toLocationLabel } from "./customers";

const CUSTOMERS = process.env.CUSTOMERS_COLLECTION_NAME || "customer_db";
const READINGS = process.env.READINGS_COLLECTION_NAME || "readings";
const TARIFFS = process.env.TARIFFS_COLLECTION_NAME || "tariff_catalog";

// ObjectId → string so it renders as plain JSON.
function strId(doc) {
  if (doc && doc._id != null) doc._id = doc._id.toString?.() ?? doc._id;
  return doc;
}

const TITLES = {
  list: "Customers List",
  profile: "Customer Profile",
  latest: "Latest Reading",
  segment: "Usage Segment",
  insights: "Insights",
  appliance: "Appliance Usage",
  tariff: "Tariff Recommendation",
  trend: "Consumption Trend",
};

/**
 * Returns the documents + operations (queries/pipelines) that ONE component of
 * the customers view actually uses, so each "show document" modal is scoped and
 * short. Sample documents are real records; operations mirror the real queries.
 *
 * @param {import("mongodb").Db} db
 * @param {string} component one of the keys in TITLES
 * @param {number} dataid the selected customer/meter id
 */
export async function getComponentModel(db, component, dataid) {
  const customer = await db.collection(CUSTOMERS).findOne({ dataid });
  if (!customer) return null;
  const locationLabel = toLocationLabel(customer.city, customer.state);

  const latestReading = () =>
    db.collection(READINGS).findOne({ dataid }, { sort: { timestamp: -1 } });
  const matchedTariff = () =>
    db.collection(TARIFFS).findOne({ location_label: locationLabel });

  const doc = {
    customer: () => ({ name: CUSTOMERS, sample: strId(customer) }),
    reading: async () => ({ name: READINGS, sample: strId(await latestReading()) }),
    tariff: async () => {
      const t = await matchedTariff();
      return { name: TARIFFS, sample: t ? strId(t) : null };
    },
  };

  let collections = [];
  let operations = [];

  switch (component) {
    case "list": {
      collections = [doc.customer(), await doc.tariff(), await doc.reading()];
      operations = [
        { title: "All customers", collection: CUSTOMERS, type: "find", filter: {}, projection: { _id: 0, dataid: 1, city: 1, state: 1 } },
        { title: "Tariff plans", collection: TARIFFS, type: "find", filter: {}, projection: { _id: 0, location_label: 1, utilityName: 1, rateName: 1, rate_type: 1 } },
        {
          title: "Latest reading per meter",
          collection: READINGS,
          type: "aggregate",
          pipeline: [
            { $sort: { dataid: 1, timestamp: -1 } },
            { $group: { _id: "$dataid", timestamp: { $first: "$timestamp" }, energy: { $first: "$energy" }, power: { $first: "$power" } } },
          ],
        },
      ];
      break;
    }
    case "profile": {
      collections = [doc.customer(), await doc.tariff(), await doc.reading()];
      operations = [
        { title: "Customer", collection: CUSTOMERS, type: "findOne", filter: { dataid } },
        { title: "Matched tariff", collection: TARIFFS, type: "findOne", filter: { location_label: locationLabel } },
        { title: "Latest reading", collection: READINGS, type: "findOne", filter: { dataid }, sort: { timestamp: -1 } },
      ];
      break;
    }
    case "latest": {
      collections = [await doc.reading()];
      operations = [
        { title: "Latest reading", collection: READINGS, type: "findOne", filter: { dataid }, sort: { timestamp: -1 } },
      ];
      break;
    }
    case "segment": {
      const tariff = await matchedTariff();
      let peers = [];
      if (tariff?.rate_type) {
        const [mt, ac] = await Promise.all([
          db.collection(TARIFFS).find({ rate_type: tariff.rate_type }, { projection: { _id: 0, location_label: 1 } }).toArray(),
          db.collection(CUSTOMERS).find({}, { projection: { _id: 0, dataid: 1, city: 1, state: 1 } }).toArray(),
        ]);
        const labels = new Set(mt.map((t) => t.location_label));
        peers = ac.filter((c) => labels.has(toLocationLabel(c.city, c.state))).map((c) => c.dataid);
      }
      collections = [await doc.reading(), { name: TARIFFS, sample: tariff ? strId(tariff) : null }, doc.customer()];
      operations = [
        {
          title: "Peer meters on the same rate plan",
          collection: READINGS,
          type: "aggregate",
          pipeline: [
            { $match: { dataid: { $in: peers } } },
            { $group: { _id: "$dataid", avgPower: { $avg: "$avg_reading" } } },
          ],
        },
      ];
      break;
    }
    case "insights": {
      collections = [await doc.reading()];
      operations = [
        {
          title: "Peak hour of the day",
          collection: READINGS,
          type: "aggregate",
          pipeline: [
            { $match: { dataid } },
            { $group: { _id: { $hour: "$timestamp" }, avgPower: { $avg: "$power" } } },
            { $sort: { avgPower: -1 } },
            { $limit: 1 },
          ],
        },
        { title: "Readings for monthly estimate", collection: READINGS, type: "find", filter: { dataid }, projection: { _id: 0, timestamp: 1, interval_kwh: 1 } },
      ];
      break;
    }
    case "appliance": {
      collections = [await doc.reading()];
      operations = [
        {
          title: "Average draw per appliance",
          collection: READINGS,
          type: "aggregate",
          pipeline: [
            { $match: { dataid } },
            {
              $group: {
                _id: null,
                hvac_power: { $avg: "$hvac_power" },
                heating_power: { $avg: "$heating_power" },
                kitchen_power: { $avg: "$kitchen_power" },
                laundry_power: { $avg: "$laundry_power" },
                env_power: { $avg: "$env_power" },
                ev_power: { $avg: "$ev_power" },
                avg_total: { $avg: "$power" },
                has_ev: { $max: { $cond: ["$has_ev", 1, 0] } },
                count: { $sum: 1 },
              },
            },
          ],
        },
      ];
      break;
    }
    case "tariff": {
      collections = [await doc.reading(), await doc.tariff()];
      operations = [
        { title: "Customer readings", collection: READINGS, type: "find", filter: { dataid }, projection: { _id: 0, timestamp: 1, interval_kwh: 1, power: 1, power_factor: 1 } },
        { title: "Matched tariff", collection: TARIFFS, type: "findOne", filter: { location_label: locationLabel } },
      ];
      break;
    }
    case "trend": {
      const all = await db.collection(CUSTOMERS).find({}, { projection: { _id: 0, dataid: 1, city: 1, state: 1 } }).toArray();
      const regionIds = all.filter((c) => toLocationLabel(c.city, c.state) === locationLabel).map((c) => c.dataid);
      collections = [doc.customer(), await doc.reading()];
      operations = [
        { title: "Customers (to resolve regions)", collection: CUSTOMERS, type: "find", filter: {}, projection: { _id: 0, dataid: 1, city: 1, state: 1 } },
        { title: "Readings for this region", collection: READINGS, type: "find", filter: { dataid: { $in: regionIds } }, projection: { _id: 0, dataid: 1, timestamp: 1, interval_kwh: 1 } },
      ];
      break;
    }
    default:
      return null;
  }

  return { title: TITLES[component] || "MongoDB", component, collections, operations };
}
