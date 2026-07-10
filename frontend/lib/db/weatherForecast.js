import {
  buildWeatherForecastPipeline,
  buildRegionCapacityPipeline,
  COMFORT_TEMP_F,
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
 * @param {string} [opts.region] region id ("City, State")
 * @param {number} [opts.lookbackDays=7] history window for profiling the baseline
 */
export async function getWeatherForecast(db, opts = {}) {
  const { region, lookbackDays = 7 } = opts;

  const regions = await getRegions(db);
  const regionList = regions.map((r) => ({ id: r.id, label: r.label }));

  const selected = regions.find((r) => r.id === region) || regions[0] || null;
  if (!selected) {
    return { regions: regionList, region: null, points: [], nowIndex: 0, pipeline: [] };
  }

  const meterIds = selected.meterIds;
  const { from, to } = await resolveWindow(db, meterIds, lookbackDays);

  // Fetch weather (external — can't run in Mongo) covering the history window
  // plus the forecast horizon (~2 days past `to`), then inject it as an array.
  const weatherEnd = to ? new Date(to.getTime() + 2 * 86_400_000) : new Date();
  const temps = from
    ? await fetchHourlyTempsF({
        lat: selected.lat,
        lon: selected.lon,
        startDate: from,
        endDate: weatherEnd,
      }).catch(() => new Map())
    : new Map();
  const tempArray = [...temps].map(([k, t]) => ({ k, t }));

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
    },
    window: { from, to },
    points,
    nowIndex,
    pipeline,
  };
}
