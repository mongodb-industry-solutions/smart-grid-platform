import { toLocationLabel, getTariffRecommendation } from "./customers";
import { getNetworkTree } from "./networkTree";

const CUSTOMERS_COLLECTION_NAME =
  process.env.CUSTOMERS_COLLECTION_NAME || "customer_db";
const READINGS_COLLECTION_NAME =
  process.env.READINGS_COLLECTION_NAME || "readings";
const TARIFFS_COLLECTION_NAME =
  process.env.TARIFFS_COLLECTION_NAME || "tariff_catalog";

const SEGMENT_LABEL = { tou: "Time-of-Use", tiered: "Tiered Rate" };

// Meter dataids beneath a utility node (for scope filtering).
function metersUnder(node) {
  const ids = new Set();
  (function walk(n) {
    if (n.meters) n.meters.forEach((m) => ids.add(m));
    (n.children || []).forEach(walk);
  })(node);
  return ids;
}

/**
 * Regional customer-segment mix (by tariff rate_type) plus a representative
 * tariff recommendation per segment. Reuses the existing per-customer tariff
 * logic (getTariffRecommendation) rather than a parallel implementation, and
 * the same customer_db ↔ tariff_catalog "City, ST" join used elsewhere.
 *
 * @param {import("mongodb").Db} db connected MongoDB database handle
 * @param {object} [options]
 * @param {string} [options.scope="all"] a utility asset id to scope to, or "all"
 */
export async function getSegmentMix(db, { scope = "all" } = {}) {
  const customers = db.collection(CUSTOMERS_COLLECTION_NAME);
  const tariffs = db.collection(TARIFFS_COLLECTION_NAME);
  const readings = db.collection(READINGS_COLLECTION_NAME);

  // Network hierarchy — used both for scope filtering and the per-utility
  // customer-count breakdown (mirrors the grid-network "customers by utility").
  const { tree } = await getNetworkTree(db);
  const scopedUtility = scope === "all" ? null : tree.find((u) => u.id === scope);
  const scopedMeterIds = scope === "all" ? null : metersUnder(scopedUtility ?? { children: [] });

  // Map every meter to its utility so scoped customers can be tallied per utility.
  const utilityByMeter = new Map();
  for (const u of tree) {
    for (const m of metersUnder(u)) utilityByMeter.set(m, { id: u.id, name: u.name });
  }

  const [customerDocs, tariffDocs] = await Promise.all([
    customers.find({}, { projection: { _id: 0, dataid: 1, city: 1, state: 1 } }).toArray(),
    tariffs
      .find({}, { projection: { _id: 0, location_label: 1, rate_type: 1, rateName: 1 } })
      .toArray(),
  ]);

  const rateByLabel = new Map(tariffDocs.map((t) => [t.location_label, t.rate_type]));

  const scoped = customerDocs.filter(
    (c) => !scopedMeterIds || scopedMeterIds.has(c.dataid)
  );

  // Average power per meter, for average usage per segment.
  const scopedIds = scoped.map((c) => c.dataid);
  const usageRows = await readings
    .aggregate([
      { $match: { dataid: { $in: scopedIds } } },
      { $group: { _id: "$dataid", avgPower: { $avg: "$avg_reading" } } },
    ])
    .toArray();
  const avgByMeter = new Map(usageRows.map((u) => [u._id, u.avgPower]));

  // Bucket customers by their plan's rate_type.
  const buckets = new Map(); // rate_type -> { members: [{dataid, avgPower}] }
  for (const c of scoped) {
    const rateType = rateByLabel.get(toLocationLabel(c.city, c.state));
    if (!rateType) continue;
    if (!buckets.has(rateType)) buckets.set(rateType, []);
    buckets.get(rateType).push({ dataid: c.dataid, avgPower: avgByMeter.get(c.dataid) ?? 0 });
  }

  const totalMatched = [...buckets.values()].reduce((s, m) => s + m.length, 0);

  // For each segment: counts, average usage, and a representative recommendation
  // from the median-usage customer (reuses getTariffRecommendation).
  const segments = [];
  for (const [rateType, members] of buckets) {
    const sorted = [...members].sort((a, b) => a.avgPower - b.avgPower);
    const median = sorted[Math.floor(sorted.length / 2)];
    const avgPowerW =
      members.reduce((s, m) => s + m.avgPower, 0) / (members.length || 1);

    let recommendation = null;
    if (median) {
      try {
        recommendation = await getTariffRecommendation(db, median.dataid);
      } catch {
        recommendation = null;
      }
    }

    segments.push({
      rateType,
      label: SEGMENT_LABEL[rateType] ?? rateType,
      customerCount: members.length,
      sharePct: totalMatched ? Math.round((members.length / totalMatched) * 1000) / 10 : 0,
      avgPowerW: Math.round(avgPowerW),
      representative: recommendation
        ? {
            dataid: median.dataid,
            monthlyTotal: recommendation.total ?? null,
            components: recommendation.components ?? null,
          }
        : null,
    });
  }

  segments.sort((a, b) => b.customerCount - a.customerCount);

  // Estimated total monthly tariff revenue = Σ (segment size × the segment's
  // representative recommended bill). An estimate — the representative bill
  // stands in for each customer in that segment.
  const estimatedMonthlyTotal = segments.reduce((sum, s) => {
    const bill = s.representative?.monthlyTotal;
    return bill != null ? sum + bill * s.customerCount : sum;
  }, 0);

  // Customers served per utility (for the bar chart), highest first.
  const byUtilityMap = new Map();
  for (const c of scoped) {
    const u = utilityByMeter.get(c.dataid);
    if (!u) continue;
    const cur = byUtilityMap.get(u.id) || { id: u.id, name: u.name, customers: 0 };
    cur.customers += 1;
    byUtilityMap.set(u.id, cur);
  }
  const byUtility = [...byUtilityMap.values()].sort((a, b) => b.customers - a.customers);

  return {
    scope,
    customersServed: scoped.length,
    totalMatched,
    estimatedMonthlyTotal: Math.round(estimatedMonthlyTotal * 100) / 100,
    byUtility,
    segments,
  };
}
