import { toLocationLabel } from "./customers";

const CUSTOMERS_COLLECTION_NAME =
  process.env.CUSTOMERS_COLLECTION_NAME || "customer_db";
const READINGS_COLLECTION_NAME =
  process.env.READINGS_COLLECTION_NAME || "readings";
const TARIFFS_COLLECTION_NAME =
  process.env.TARIFFS_COLLECTION_NAME || "tariff_catalog";

// ObjectId → string so it renders as plain JSON in the modal.
function stringifyId(doc) {
  if (doc && doc._id != null) doc._id = doc._id.toString?.() ?? doc._id;
  return doc;
}

/**
 * The "internal logic" behind the customers view: a representative document from
 * each collection it reads, plus the actual aggregation pipelines it runs — so
 * the demo can reveal MongoDB's document model and queries for the selected
 * customer.
 *
 * @param {import("mongodb").Db} db connected MongoDB database handle
 * @param {number} dataid the selected customer/meter id
 */
export async function getCustomersViewModel(db, dataid) {
  const customer = await db
    .collection(CUSTOMERS_COLLECTION_NAME)
    .findOne({ dataid });
  if (!customer) return null;

  const locationLabel = toLocationLabel(customer.city, customer.state);

  const [reading, tariff] = await Promise.all([
    db
      .collection(READINGS_COLLECTION_NAME)
      .findOne({ dataid }, { sort: { timestamp: -1 } }),
    db
      .collection(TARIFFS_COLLECTION_NAME)
      .findOne({ location_label: locationLabel }),
  ]);

  // Peer meters on the same rate plan — the $in used by the Usage Segment query.
  let segmentDataids = [];
  if (tariff?.rate_type) {
    const [matchingTariffs, allCustomers] = await Promise.all([
      db
        .collection(TARIFFS_COLLECTION_NAME)
        .find({ rate_type: tariff.rate_type }, { projection: { _id: 0, location_label: 1 } })
        .toArray(),
      db
        .collection(CUSTOMERS_COLLECTION_NAME)
        .find({}, { projection: { _id: 0, dataid: 1, city: 1, state: 1 } })
        .toArray(),
    ]);
    const labels = new Set(matchingTariffs.map((t) => t.location_label));
    segmentDataids = allCustomers
      .filter((c) => labels.has(toLocationLabel(c.city, c.state)))
      .map((c) => c.dataid);
  }

  const collections = [
    { name: CUSTOMERS_COLLECTION_NAME, sample: stringifyId(customer) },
    { name: READINGS_COLLECTION_NAME, sample: reading ? stringifyId(reading) : null },
    { name: TARIFFS_COLLECTION_NAME, sample: tariff ? stringifyId(tariff) : null },
  ];

  const pipelines = [
    {
      title: "Insights — peak hour of the day",
      collection: READINGS_COLLECTION_NAME,
      stages: [
        { $match: { dataid } },
        { $group: { _id: { $hour: "$timestamp" }, avgPower: { $avg: "$power" } } },
        { $sort: { avgPower: -1 } },
        { $limit: 1 },
      ],
    },
    {
      title: "Appliance usage — average draw per appliance",
      collection: READINGS_COLLECTION_NAME,
      stages: [
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
    {
      title: "Usage segment — peer comparison (same rate plan)",
      collection: READINGS_COLLECTION_NAME,
      stages: [
        { $match: { dataid: { $in: segmentDataids } } },
        { $group: { _id: "$dataid", avgPower: { $avg: "$avg_reading" } } },
      ],
    },
  ];

  return { collections, pipelines };
}
