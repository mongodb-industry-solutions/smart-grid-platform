import { buildDemandPipeline } from "@/lib/const/demandPipeline";

const READINGS_COLLECTION = process.env.READINGS_COLLECTION_NAME || "readings";
// Bound the history each request scans so the aggregation stays fast on
// large (multi-week) collections. 14 days is plenty for a per-hour demand curve.
const DEMAND_LOOKBACK_DAYS = 14;

export { buildDemandPipeline };

// Two-tailed 95% Student-t critical values by degrees of freedom (~1.96 as df → ∞).
const T_95 = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365,
  8: 2.306, 9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145,
  15: 2.131, 16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
};
function tValue(df) {
  if (df < 1) return T_95[1];
  if (T_95[df]) return T_95[df];
  return df <= 60 ? 2.0 : 1.96;
}

const round = (v) => Math.round(v * 100) / 100;

/**
 * Runs the expected-demand aggregation and reduces it to one bar per region:
 * the expected PEAK demand (highest hourly expectation) with a 95% prediction
 * interval, plus the all-day average. Sorted by peak. The pipeline is built from
 * the current filter selection so it stays in sync with what's shown in the card.
 *
 * @param {import("mongodb").Db} db connected MongoDB database handle
 * @param {{ states?: string[], feeders?: string[], meterIds?: (string|number)[] }} selection
 */
export async function getDemandForecast(db, selection = {}) {
  // Anchor to the latest reading (the dataset lives in the past) and look back.
  let from = selection.from ? new Date(selection.from) : null;
  if (!from) {
    const last = await db
      .collection(READINGS_COLLECTION)
      .findOne({}, { projection: { timestamp: 1 }, sort: { timestamp: -1 } });
    if (last?.timestamp) {
      from = new Date(new Date(last.timestamp).getTime() - DEMAND_LOOKBACK_DAYS * 86_400_000);
    }
  }
  const pipeline = buildDemandPipeline({ ...selection, from });
  const rows = await db
    .collection(READINGS_COLLECTION)
    .aggregate(pipeline)
    .toArray();

  // region -> [{ hour, expected, std, n }]
  const byRegion = new Map();
  for (const r of rows) {
    const region = r._id.region;
    if (!region) continue;
    if (!byRegion.has(region)) byRegion.set(region, []);
    byRegion.get(region).push({
      hour: r._id.hour,
      expected: r.expected_kw ?? 0,
      std: r.std_dev ?? 0,
      n: r.samples ?? 0,
    });
  }

  const regions = [...byRegion.keys()].sort();
  if (regions.length === 0) {
    return { pipeline, regions: [], bars: [] };
  }

  // One bar per region: peak-hour expectation + 95% prediction interval.
  const bars = regions
    .map((region) => {
      const hours = byRegion.get(region);
      const peak = hours.reduce((a, b) => (b.expected > a.expected ? b : a));
      const average =
        hours.reduce((sum, h) => sum + h.expected, 0) / hours.length;
      const margin =
        peak.n >= 2 && peak.std > 0
          ? tValue(peak.n - 1) * peak.std * Math.sqrt(1 + 1 / peak.n)
          : 0;
      return {
        region,
        peak: round(peak.expected),
        peakHour: peak.hour,
        average: round(average),
        margin: round(margin),
        lower: round(Math.max(0, peak.expected - margin)),
        upper: round(peak.expected + margin),
      };
    })
    .sort((a, b) => b.peak - a.peak);

  return { pipeline, regions, bars };
}
