import { getGridStability } from "./gridStability";
import { getNetworkTree } from "./networkTree";
import { getAnomalies } from "./anomalies";

const READINGS_COLLECTION_NAME =
  process.env.READINGS_COLLECTION_NAME || "readings";

// Peak-load warning cutoffs on latest_demand / capacity_kw. Kept here as named
// constants so the buckets can be tuned in one place (confirmed with the team:
// normal < 85%, warning 85–95%, critical ≥ 95%).
export const PEAK_WARNING_PCT = 85;
export const PEAK_CRITICAL_PCT = 95;

// Utilization level below which capacity contributes no health penalty.
const HEALTH_CAPACITY_FLOOR_PCT = 70;
// Each anomalous meter costs this many health points, capped by ANOMALY_CAP.
const HEALTH_ANOMALY_WEIGHT = 10;
const HEALTH_ANOMALY_CAP = 30;

/** Bucket a utilization percentage into a normal/warning/critical status. */
export function utilizationStatus(pct) {
  if (pct == null) return "unknown";
  if (pct >= PEAK_CRITICAL_PCT) return "critical";
  if (pct >= PEAK_WARNING_PCT) return "warning";
  return "normal";
}

// Substation health: 100 − capacity_penalty − anomaly_penalty, clamped 0–100.
//   capacity_penalty = max(0, util% − 70)              (0 at ≤70%, 30 at 100%)
//   anomaly_penalty  = min(30, anomaly_count × 10)
function healthScore(utilPct, anomalyCount) {
  const capacityPenalty =
    utilPct == null ? 0 : Math.max(0, utilPct - HEALTH_CAPACITY_FLOOR_PCT);
  const anomalyPenalty = Math.min(
    HEALTH_ANOMALY_CAP,
    anomalyCount * HEALTH_ANOMALY_WEIGHT
  );
  return Math.max(0, Math.min(100, Math.round(100 - capacityPenalty - anomalyPenalty)));
}

// Collect the feeder ids and meter dataids beneath a network node (any depth).
function collectDescendants(node) {
  const feederIds = new Set();
  const meterIds = new Set();
  (function walk(n) {
    if (n.type === "feeder") feederIds.add(n.id);
    if (n.meters) n.meters.forEach((m) => meterIds.add(m));
    (n.children || []).forEach(walk);
  })(node);
  return { feederIds, meterIds };
}

/**
 * Composes the grid network-center overview from the project's existing
 * aggregations — feeder load vs capacity (getGridStability), the network
 * hierarchy (getNetworkTree), per-meter anomalies (getAnomalies), plus the same
 * "power ≤ 0" outage definition used by getOutagesSummary — and rolls them up
 * per feeder / substation for the ops panels.
 *
 * @param {import("mongodb").Db} db connected MongoDB database handle
 * @param {object} [options]
 * @param {string} [options.scope="all"] a utility asset id to scope to, or "all"
 */
export async function getNetworkCenterOverview(db, { scope = "all" } = {}) {
  const [grid, { tree }, anomalies, outageRows] = await Promise.all([
    getGridStability(db, 0),
    getNetworkTree(db),
    getAnomalies(db),
    db
      .collection(READINGS_COLLECTION_NAME)
      .aggregate([{ $match: { power: { $lte: 0 } } }, { $group: { _id: "$dataid" } }])
      .toArray(),
  ]);

  const feederById = new Map(grid.feeders.map((f) => [f.feeder_id, f]));
  const outageMeters = new Set(outageRows.map((r) => r._id));
  const anomalyMeters = anomalies.map((a) => a.meterId);

  const utilities = scope === "all" ? tree : tree.filter((u) => u.id === scope);

  // Network totals for the KPI strip (scoped), mirroring the grid-network view.
  const totals = { utilities: utilities.length, substations: 0, feeders: 0, transformers: 0, meters: 0, capacity: 0 };
  (function countAll(nodes) {
    for (const n of nodes) {
      if (n.type === "substation") totals.substations += 1;
      if (n.type === "feeder") totals.feeders += 1;
      if (n.type === "transformer") {
        totals.transformers += 1;
        totals.capacity += n.capacityKw || 0;
      }
      if (n.meters) totals.meters += n.meters.length;
      if (n.children) countAll(n.children);
    }
  })(utilities);

  // Flatten the scoped hierarchy into substations + a feeder → metadata lookup,
  // and roll current load (kW) up feeder → substation → utility for the map.
  const substations = [];
  const feederMeta = new Map();
  const loadById = {};
  for (const u of utilities) {
    let uLoad = 0;
    for (const sub of u.children || []) {
      substations.push({ node: sub, utilityName: u.name });
      let sLoad = 0;
      for (const feeder of sub.children || []) {
        feederMeta.set(feeder.id, { name: feeder.name, substationName: sub.name });
        const load = feederById.get(feeder.id)?.total_load || 0;
        loadById[feeder.id] = load;
        sLoad += load;
      }
      loadById[sub.id] = Math.round(sLoad * 100) / 100;
      uLoad += sLoad;
    }
    loadById[u.id] = Math.round(uLoad * 100) / 100;
  }

  // ── Peak-load warnings (feeder-level) ──
  const peakWarnings = [];
  for (const [feederId, meta] of feederMeta) {
    const f = feederById.get(feederId);
    if (!f || f.utilization_pct == null) continue;
    peakWarnings.push({
      feederId,
      name: meta.name,
      substationName: meta.substationName,
      loadKw: f.total_load,
      capacityKw: f.capacity_kw,
      utilizationPct: f.utilization_pct,
      status: utilizationStatus(f.utilization_pct),
    });
  }
  peakWarnings.sort((a, b) => b.utilizationPct - a.utilizationPct);

  // ── Substation health + outage risk, and node status map for the grid map ──
  const substationHealth = [];
  const outageRisk = [];
  const statusById = {};

  for (const { node: sub, utilityName } of substations) {
    const { feederIds, meterIds } = collectDescendants(sub);

    let load = 0;
    let cap = 0;
    let haveCap = false;
    for (const fid of feederIds) {
      const f = feederById.get(fid);
      if (!f) continue;
      load += f.total_load || 0;
      if (f.capacity_kw) {
        cap += f.capacity_kw;
        haveCap = true;
      }
      statusById[fid] = utilizationStatus(f.utilization_pct);
    }

    const utilPct = haveCap && cap > 0 ? Math.round((load / cap) * 1000) / 10 : null;
    const anomalyCount = anomalyMeters.filter((m) => meterIds.has(m)).length;
    const utilStatus = utilizationStatus(utilPct);

    substationHealth.push({
      id: sub.id,
      name: sub.name,
      utilityName,
      utilizationPct: utilPct,
      anomalyCount,
      healthScore: healthScore(utilPct, anomalyCount),
      status: utilStatus,
    });

    const meterCount = meterIds.size;
    const outageCount = [...meterIds].filter((m) => outageMeters.has(m)).length;
    const outagePct = meterCount ? Math.round((outageCount / meterCount) * 1000) / 10 : 0;
    // Risk blends the share of meters currently out with anomaly pressure.
    const riskScore = Math.min(100, Math.round(outagePct * 0.6 + anomalyCount * 8));
    const severity = riskScore >= 66 ? "high" : riskScore >= 33 ? "medium" : "low";

    outageRisk.push({
      id: sub.id,
      name: sub.name,
      utilityName,
      meterCount,
      outageMeters: outageCount,
      outagePct,
      anomalyCount,
      riskScore,
      severity,
    });

    // The map colors a substation by the worse of its capacity + outage signals.
    statusById[sub.id] =
      utilStatus === "critical" || severity === "high"
        ? "critical"
        : utilStatus === "warning" || severity === "medium"
        ? "warning"
        : utilPct == null
        ? "unknown"
        : "normal";
  }

  substationHealth.sort((a, b) => a.healthScore - b.healthScore); // worst first
  outageRisk.sort((a, b) => b.riskScore - a.riskScore);

  // ── Live demand (aggregate over the scoped feeders' latest snapshot) ──
  let totalLoad = 0;
  let totalCap = 0;
  for (const feederId of feederMeta.keys()) {
    const f = feederById.get(feederId);
    if (!f) continue;
    totalLoad += f.total_load || 0;
    totalCap += f.capacity_kw || 0;
  }
  const liveDemand = {
    totalLoadKw: Math.round(totalLoad * 100) / 100,
    totalCapacityKw: Math.round(totalCap),
    utilizationPct: totalCap > 0 ? Math.round((totalLoad / totalCap) * 1000) / 10 : null,
    feederCount: feederMeta.size,
    timestamp: grid.timestamp ?? null,
  };

  return {
    scope,
    utilities: tree.map((u) => ({ id: u.id, name: u.name })),
    totals,
    loadById,
    thresholds: { warning: PEAK_WARNING_PCT, critical: PEAK_CRITICAL_PCT },
    liveDemand,
    peakWarnings,
    substationHealth,
    outageRisk,
    statusById,
  };
}
