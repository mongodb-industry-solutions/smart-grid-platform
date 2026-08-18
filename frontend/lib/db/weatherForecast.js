import {
  buildWeatherForecastPipeline,
  buildRegionCapacityPipeline,
  COMFORT_TEMP_F,
  HEATING_BASE_F,
  COOLING_BASE_F,
  DEFAULT_LOOKBACK_DAYS,
  FORECAST_HOURS,
} from "@/lib/const/weatherForecastPipeline";
import { getCityCoordinates } from "@/lib/const/cityCoordinates";
import { fetchHourlyTempsF } from "@/lib/weather/openMeteo";

const CUSTOMERS_COLLECTION =
  process.env.CUSTOMERS_COLLECTION_NAME || "customer_db";
const READINGS_COLLECTION = process.env.READINGS_COLLECTION_NAME || "readings";
const NETWORK_MAP_COLLECTION =
  process.env.NETWORK_MAP_COLLECTION_NAME || "meter_network_map";
const NETWORK_COLLECTION = process.env.NETWORK_COLLECTION_NAME || "network";

// A customer region id is its "City, State" label (stable, human-readable).
const regionId = (city, state) => `${city}, ${state}`;

// Shift a "YYYY-MM-DDTHH" UTC hour key forward by `ms`. Used to map real-weather
// hours onto the simulated (feeder-advanced) future hours the readings carry, so
// the injected temperatures line up with the sim timestamps in the pipeline.
function shiftHourKey(key, ms) {
  if (!ms) return key;
  return new Date(new Date(`${key}:00:00Z`).getTime() + ms).toISOString().slice(0, 13);
}

/**
 * Customer regions (city/state) that we can forecast — i.e. that have known
 * coordinates for the Open-Meteo lookup. Each also carries its meter dataids so
 * the caller doesn't re-query. Small, stable list.
 */
async function getRegions(db) {
  const rows = await db
    .collection(CUSTOMERS_COLLECTION)
    .aggregate([
      { $match: { city: { $ne: null }, state: { $ne: null } } },
      {
        $group: {
          _id: { city: "$city", state: "$state" },
          meterIds: { $addToSet: "$dataid" },
        },
      },
      { $sort: { "_id.state": 1, "_id.city": 1 } },
    ])
    .toArray();

  return rows
    .map((r) => {
      const { city, state } = r._id;
      const coords = getCityCoordinates(city, state); // [lon, lat] or null
      if (!coords) return null;
      return {
        id: regionId(city, state),
        label: regionId(city, state),
        city,
        state,
        lon: coords[0],
        lat: coords[1],
        meterIds: r.meterIds,
      };
    })
    .filter(Boolean);
}

// Resolve the region/feeder/meter selection (as sent by the panel) to the set
// of meter dataids it covers, using the same fields as the demand pipeline.
// Returns null when nothing is selected (caller falls back to a default region).
async function resolveSelectedMeterIds(db, { states, feeders, meterIds }) {
  const match = {};
  if (states?.length) match.state = { $in: states };
  if (feeders?.length) match.feeder_id = { $in: feeders };
  if (meterIds?.length) {
    const nums = meterIds.map(Number).filter((n) => !Number.isNaN(n));
    if (nums.length) match.dataid = { $in: nums };
  }
  if (Object.keys(match).length === 0) return null; // "all" → no narrowing

  const row = await db
    .collection(NETWORK_MAP_COLLECTION)
    .aggregate([
      { $match: match },
      { $group: { _id: null, ids: { $addToSet: "$dataid" } } },
    ])
    .next();
  return row?.ids ?? [];
}

// Anchor the window to the latest real reading (the dataset is fixed in the
// past — see the readings-data-window note), looking back `lookbackDays`.
async function resolveWindow(db, meterIds, lookbackDays) {
  const col = db.collection(READINGS_COLLECTION);
  const last = await col
    .find(
      { dataid: { $in: meterIds }, voltage: { $ne: null } },
      { projection: { _id: 0, timestamp: 1 } }
    )
    .sort({ timestamp: -1 })
    .limit(1)
    .next();
  const to = last?.timestamp ? new Date(last.timestamp) : null;
  const from = to ? new Date(to.getTime() - lookbackDays * 86_400_000) : null;
  return { from, to };
}

/**
 * Weather-adjusted energy-usage forecast for one customer region, plus the list
 * of all forecastable regions (so the UI can populate its selector from a single
 * request). When `region` is omitted, the first region is used.
 *
 * The forecast math runs entirely in MongoDB (see buildWeatherForecastPipeline);
 * this layer only resolves the region/window, fetches weather from the external
 * Open-Meteo API, and hands it to the aggregation as an injected temp array.
 *
 * @param {import("mongodb").Db} db
 * @param {Object} [opts]
 * @param {string[]} [opts.states] selected regions
 * @param {string[]} [opts.feeders] selected feeder_ids
 * @param {string[]} [opts.meterIds] selected meter ids
 * @param {number} [opts.lookbackDays] history window for the baseline & slope
 *   fit (defaults to DEFAULT_LOOKBACK_DAYS — all available history)
 */
export async function getWeatherForecast(db, opts = {}) {
  const {
    states = [],
    feeders = [],
    meterIds: selMeters = [],
    lookbackDays = DEFAULT_LOOKBACK_DAYS,
  } = opts;

  const regions = await getRegions(db);
  const regionList = regions.map((r) => ({ id: r.id, label: r.label }));

  if (regions.length === 0) {
    return { regions: regionList, region: null, points: [], nowIndex: 0, pipeline: [] };
  }

  // Map the panel selection to a meter set. The forecast covers those meters;
  // its weather comes from the forecastable region they overlap most (a single
  // city's temperature drives the whole selection). Empty selection → default.
  const selectedIds = await resolveSelectedMeterIds(db, {
    states,
    feeders,
    meterIds: selMeters,
  });

  let selected;
  let meterIds;
  if (selectedIds && selectedIds.length) {
    const idSet = new Set(selectedIds);
    selected = regions
      .map((r) => ({ r, overlap: r.meterIds.filter((id) => idSet.has(id)).length }))
      .sort((a, b) => b.overlap - a.overlap)[0].r;
    meterIds = selectedIds;
  } else {
    selected = regions[0];
    meterIds = selected.meterIds;
  }

  const { from, to } = await resolveWindow(db, meterIds, lookbackDays);

  // Fetch weather (external — can't run in Mongo) covering the history window plus
  // the forecast horizon. Two constraints collide: the archive API only has data
  // up to ~now (a future date range yields no temps → blank line), while the live
  // feeder advances the readings' *sim* clock ahead of real time, so `to` and the
  // horizon can sit days/weeks in the future. So we shift the requested window
  // back onto real dates the archive covers, fetch there, then re-key the temps
  // FORWARD onto the sim hours so they line up with the readings. With no drift
  // (fresh seed / no feeder) the shift is 0 and this is a plain real-window fetch.
  const HOUR_MS = 3_600_000;
  let tempArray = [];
  if (from && to) {
    const simEnd = to.getTime() + FORECAST_HOURS * HOUR_MS; // history + horizon
    const shiftMs = Math.max(0, Math.ceil((simEnd - Date.now()) / HOUR_MS) * HOUR_MS);
    const temps = await fetchHourlyTempsF({
      lat: selected.lat,
      lon: selected.lon,
      startDate: new Date(from.getTime() - shiftMs),
      endDate: new Date(simEnd - shiftMs), // ≤ now, so the archive has it
    }).catch(() => new Map());
    tempArray = [...temps].map(([k, t]) => ({ k: shiftHourKey(k, shiftMs), t }));
  }

  const pipeline = buildWeatherForecastPipeline({ meterIds, from, to, tempArray });
  const capacityPipeline = buildRegionCapacityPipeline({
    meterIds,
    networkCollection: NETWORK_COLLECTION,
  });

  const [forecastDoc, capRows] = await Promise.all([
    db.collection(READINGS_COLLECTION).aggregate(pipeline, { allowDiskUse: true }).next(),
    db.collection(NETWORK_MAP_COLLECTION).aggregate(capacityPipeline).toArray(),
  ]);

  const capacityKw = capRows[0]?.capacity_kw ?? null;
  const points = forecastDoc?.points ?? [];
  const nowIndex = forecastDoc?.nowIndex ?? 0;

  return {
    regions: regionList,
    region: {
      id: selected.id,
      name: selected.label,
      city: selected.city,
      state: selected.state,
      capacityKw,
      weatherSensitivity: forecastDoc?.weatherSensitivity ?? 0,
      weatherMode: forecastDoc?.weatherMode ?? "heating",
      comfortTempF: COMFORT_TEMP_F,
      heatingBaseF: HEATING_BASE_F,
      coolingBaseF: COOLING_BASE_F,
      weekdayFactor: forecastDoc?.weekdayFactor ?? 1,
      weekendFactor: forecastDoc?.weekendFactor ?? 1,
    },
    window: { from, to },
    points,
    nowIndex,
    pipeline,
  };
}
