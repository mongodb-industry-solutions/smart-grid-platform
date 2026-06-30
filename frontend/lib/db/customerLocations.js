const CUSTOMERS_COLLECTION_NAME =
  process.env.CUSTOMERS_COLLECTION_NAME || "customer_db";
const READINGS_COLLECTION_NAME =
  process.env.READINGS_COLLECTION_NAME || "readings";

/**
 * Aggregates customers and outages by location for the map.
 *
 * Each customer is counted once. Returns one entry per distinct city/state:
 *  - outages: customers with at least one outage reading (power <= 0), joined
 *    from the readings collection via dataid (a customer is counted once even
 *    with several outage readings).
 *  - customers: the remaining customers there (without any outage).
 *  So customers + outages = total customers in that city (no double counting).
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

  // Distinct customers with an outage per city, joined to the customer that
  // owns each meter. A customer with several outage readings is counted once.
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
          meters: { $addToSet: "$dataid" },
        },
      },
      { $set: { outages: { $size: "$meters" } } },
    ])
    .toArray();

  // Merge by city/state. Each customer is counted once: those with an outage
  // go to `outages` (red), the rest to `customers` (green) — no double counting.
  const byKey = new Map();
  for (const entry of customersByCity) {
    const { city, state } = entry._id;
    byKey.set(`${city}, ${state}`, {
      city,
      state,
      total: entry.customers,
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
      byKey.set(key, { city, state, total: entry.outages, outages: entry.outages });
    }
  }

  return [...byKey.values()]
    .map(({ city, state, total, outages }) => ({
      city,
      state,
      customers: Math.max(0, total - outages),
      outages,
    }))
    .sort((a, b) => b.customers + b.outages - (a.customers + a.outages));
}
