const CUSTOMERS_COLLECTION_NAME =
  process.env.CUSTOMERS_COLLECTION_NAME || "customer_db";
const READINGS_COLLECTION_NAME =
  process.env.READINGS_COLLECTION_NAME || "readings";
const NETWORK_COLLECTION_NAME =
  process.env.NETWORK_COLLECTION_NAME || "network";
const NETWORK_MAP_COLLECTION_NAME =
  process.env.NETWORK_MAP_COLLECTION_NAME || "meter_network_map";

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

  // Representative substation → feeder → transformer per city, derived from a
  // real meter in that city: customer → meter_network_map → network, walking up
  // parent_asset_id (transformer → feeder → substation). This guarantees the
  // linkage matches the actual grid, since only substations carry a city field.
  const assets = await db
    .collection(NETWORK_COLLECTION_NAME)
    .find(
      {},
      { projection: { _id: 0, asset_id: 1, asset_type: 1, name: 1, parent_asset_id: 1 } }
    )
    .toArray();
  const assetById = new Map(assets.map((a) => [a.asset_id, a]));

  // One representative meter per city.
  const repMeters = await customers
    .aggregate([
      { $match: { city: { $ne: null }, dataid: { $ne: null } } },
      {
        $group: {
          _id: { city: "$city", state: "$state" },
          dataid: { $first: "$dataid" },
        },
      },
    ])
    .toArray();

  const mapRows = await db
    .collection(NETWORK_MAP_COLLECTION_NAME)
    .find(
      { dataid: { $in: repMeters.map((r) => r.dataid) } },
      { projection: { _id: 0, dataid: 1, feeder_id: 1, transformer_id: 1 } }
    )
    .toArray();
  const mapByDataid = new Map(mapRows.map((m) => [m.dataid, m]));

  const substationByKey = new Map();
  const feederByKey = new Map();
  const transformerByKey = new Map();
  for (const r of repMeters) {
    const key = `${r._id.city}, ${r._id.state}`;
    const m = mapByDataid.get(r.dataid);
    if (!m) continue;

    const transformer = assetById.get(m.transformer_id);
    if (transformer) transformerByKey.set(key, transformer.name);

    // Feeder: from the map's feeder_id, else the transformer's parent.
    const feeder =
      (m.feeder_id && assetById.get(m.feeder_id)) ||
      (transformer?.parent_asset_id && assetById.get(transformer.parent_asset_id));
    if (feeder) {
      feederByKey.set(key, feeder.name);
      const substation =
        feeder.parent_asset_id && assetById.get(feeder.parent_asset_id);
      if (substation) substationByKey.set(key, substation.name);
    }
  }

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
      substation: substationByKey.get(`${city}, ${state}`) ?? null,
      feeder: feederByKey.get(`${city}, ${state}`) ?? null,
      transformer: transformerByKey.get(`${city}, ${state}`) ?? null,
    }))
    .sort((a, b) => b.customers + b.outages - (a.customers + a.outages));
}
