const CUSTOMERS_COLLECTION_NAME =
  process.env.CUSTOMERS_COLLECTION_NAME || "customer_db";
const READINGS_COLLECTION_NAME =
  process.env.READINGS_COLLECTION_NAME || "readings";

/**
 * Aggregates customers and outages by location for the map.
 *
 * Returns one entry per distinct city/state with two counts:
 *  - customers: how many customers live there.
 *  - outages: how many outage readings (avg_reading <= 0) belong to customers
 *    there, joined from the readings collection via dataid.
 *
 * @param {import("mongodb").Db} db connected MongoDB database handle
 * @returns {Promise<Array<{ city: string, state: string, customers: number, outages: number }>>}
 */
export async function getCustomerLocations(db) {
  const customers = db.collection(CUSTOMERS_COLLECTION_NAME);
  const readings = db.collection(READINGS_COLLECTION_NAME);

  // Customers per city.
  const customersByCity = await customers
    .aggregate([
      {
        $group: {
          _id: { city: "$city", state: "$state" },
          customers: { $sum: 1 },
        },
      },
    ])
    .toArray();

  // Outage readings per city, joined to the customer that owns each meter.
  const outagesByCity = await readings
    .aggregate([
      { $match: { power: { $lte: 0 } } },
      {
        $lookup: {
          from: CUSTOMERS_COLLECTION_NAME,
          localField: "dataid",
          foreignField: "dataid",
          as: "customer",
        },
      },
      // Keep only outages that map to a customer, and use that customer's city.
      { $match: { "customer.0": { $exists: true } } },
      {
        $set: {
          city: { $arrayElemAt: ["$customer.city", 0] },
          state: { $arrayElemAt: ["$customer.state", 0] },
        },
      },
      {
        $group: {
          _id: { city: "$city", state: "$state" },
          outages: { $sum: 1 },
        },
      },
    ])
    .toArray();

  // Merge the two result sets by city/state into a single list.
  const byKey = new Map();
  for (const entry of customersByCity) {
    const { city, state } = entry._id;
    byKey.set(`${city}, ${state}`, {
      city,
      state,
      customers: entry.customers,
      outages: 0,
    });
  }
  for (const entry of outagesByCity) {
    const { city, state } = entry._id;
    const key = `${city}, ${state}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.outages = entry.outages;
    } else {
      byKey.set(key, { city, state, customers: 0, outages: entry.outages });
    }
  }

  return [...byKey.values()].sort((a, b) => b.customers - a.customers);
}
