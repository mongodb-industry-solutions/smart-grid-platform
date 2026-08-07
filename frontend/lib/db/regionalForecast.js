import {
  buildRegionalForecastPipeline,
  buildRegionCapacityPipeline,
} from "@/lib/const/regionalForecastPipeline";
import { forecastRegion } from "@/lib/forecast/regionalForecast";

const READINGS_COLLECTION = process.env.READINGS_COLLECTION_NAME || "readings";
const NETWORK_MAP_COLLECTION =
  process.env.NETWORK_MAP_COLLECTION_NAME || "meter_network_map";
const NETWORK_COLLECTION = process.env.NETWORK_COLLECTION_NAME || "network";

// Resolve the historical window from the data itself. The dataset is anchored
// in the past, so defaulting to wall-clock "now" would forecast off the end of
// an empty range (see the readings-data-window note). We anchor to the latest
// real reading and look back `lookbackDays`.
async function resolveWindow(db, { from, to, lookbackDays }) {
  const col = db.collection(READINGS_COLLECTION);
  let toDate = to ? new Date(to) : null;
  if (!toDate) {
    const last = await col
      .find({ voltage: { $ne: null } }, { projection: { _id: 0, timestamp: 1 } })
      .sort({ timestamp: -1 })
      .limit(1)
      .next();
    toDate = last?.timestamp ? new Date(last.timestamp) : null;
  }
  let fromDate = from ? new Date(from) : null;
  if (!fromDate && toDate) {
    if (lookbackDays) {
      fromDate = new Date(toDate.getTime() - lookbackDays * 86_400_000);
    } else {
      const first = await col
        .find(
          { voltage: { $ne: null } },
          { projection: { _id: 0, timestamp: 1 } }
        )
        .sort({ timestamp: 1 })
        .limit(1)
        .next();
      fromDate = first?.timestamp ? new Date(first.timestamp) : null;
    }
  }
  return { from: fromDate ?? undefined, to: toDate ?? undefined };
}

/**
 * Per-region demand forecast vs capacity for the demand-peaks view.
 *
 * @param {import("mongodb").Db} db
 * @param {Object} opts
 * @param {"utility"|"substation"|"feeder"} [opts.level="feeder"]
 * @param {string[]} [opts.regionIds] region node ids (2+ to compare)
 * @param {{states?:string[],utilities?:string[],substations?:string[]}} [opts.parentScope]
 * @param {(string|number)[]} [opts.meterIds]
 * @param {string|Date} [opts.from] / [opts.to] window bounds
 * @param {number} [opts.lookbackDays] window size when `from` is omitted
 * @param {number} [opts.horizonHours=24]
 */
export async function getRegionalForecast(db, opts = {}) {
  const {
    level = "feeder",
    regionIds = [],
    parentScope = {},
    meterIds = [],
    horizonHours = 24,
    // Bound the history each request scans. 7 days covers the hour-of-day shape
    // (and a first pass at day-of-week) while keeping the response under ~2s on
    // large (multi-week) collections. Callers can widen it via opts.lookbackDays.
    lookbackDays = 7,
  } = opts;

  const { from, to } = await resolveWindow(db, {
    from: opts.from,
    to: opts.to,
    lookbackDays,
  });

  const pipeline = buildRegionalForecastPipeline({
    level,
    regionIds,
    parentScope,
    meterIds,
    from,
    to,
  });

  const rows = await db
    .collection(READINGS_COLLECTION)
    .aggregate(pipeline, { allowDiskUse: true })
    .toArray();

  // region -> [{ period, demand_kw }]
  const byRegion = new Map();
  for (const r of rows) {
    const region = r._id?.region;
    if (region == null) continue;
    if (!byRegion.has(region)) byRegion.set(region, []);
    byRegion.get(region).push({ period: r._id.period, demand_kw: r.demand_kw });
  }

  const ids = [...byRegion.keys()];
  const capacityPipeline = buildRegionCapacityPipeline({ regionIds: ids });
  const capRows = ids.length
    ? await db.collection(NETWORK_COLLECTION).aggregate(capacityPipeline).toArray()
    : [];
  const capMap = new Map(capRows.map((c) => [c.region, c]));

  const regions = ids
    .sort()
    .map((regionId) => {
      const meta = capMap.get(regionId) || {};
      const forecast = forecastRegion({
        series: byRegion.get(regionId),
        capacity_kw: meta.capacity_kw ?? null,
        horizonHours,
      });
      return {
        regionId,
        label: meta.name || regionId,
        city: meta.city ?? null,
        asset_type: meta.asset_type ?? null,
        ...forecast,
      };
    })
    // Most-pressured region first.
    .sort(
      (a, b) => (b.peak?.pctCapacity ?? -1) - (a.peak?.pctCapacity ?? -1)
    );

  return {
    level,
    window: { from, to, horizonHours },
    pipeline,
    capacityPipeline,
    regions,
  };
}
