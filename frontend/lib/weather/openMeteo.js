// Open-Meteo hourly temperature fetch for the weather-adjusted demand forecast.
// No API key required (free for non-commercial use).
//
// The demo's readings are anchored in the past (see the readings-data-window
// note), and we forecast a short horizon just past the last reading — a range
// that is itself in the past relative to wall-clock now. The /v1/forecast
// endpoint only serves recent-past + near-future, so it can't cover that
// window; the ERA5 *archive* API can, keyed to an explicit date range. We
// request Fahrenheit and UTC directly so the series lines up with the UTC
// reading timestamps used by the forecast model ($dateTrunc / getUTCHours).
//
// Caching: a small module-level cache keyed by rounded lat/lon + date range,
// short TTL. This view is hit interactively (region switching) but the data is
// static historical weather, so an in-memory cache avoids re-fetching without
// needing a new collection. Swap for a persisted cache if this runs multi-node.

const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const TTL_MS = 30 * 60 * 1000;

const cache = new Map(); // key -> { at: number, temps: Map<isoHour, tempF> }

const ymd = (date) => new Date(date).toISOString().slice(0, 10); // "YYYY-MM-DD"

function keyFor(lat, lon, start, end) {
  return `${lat.toFixed(3)},${lon.toFixed(3)},${start},${end}`;
}

/**
 * Hourly 2m temperature (°F) for a coordinate over an explicit date range,
 * keyed by UTC hour ("YYYY-MM-DDTHH").
 *
 * @param {Object} args
 * @param {number} args.lat
 * @param {number} args.lon
 * @param {Date|string} args.startDate window start (inclusive)
 * @param {Date|string} args.endDate window end (inclusive)
 * @returns {Promise<Map<string, number>>}
 */
export async function fetchHourlyTempsF({ lat, lon, startDate, endDate }) {
  const start = ymd(startDate);
  const end = ymd(endDate);
  const key = keyFor(lat, lon, start, end);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.temps;

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: start,
    end_date: end,
    hourly: "temperature_2m",
    temperature_unit: "fahrenheit",
    timezone: "UTC",
  });

  const res = await fetch(`${ARCHIVE_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`Open-Meteo request failed (${res.status})`);
  const json = await res.json();

  const times = json?.hourly?.time ?? [];
  const values = json?.hourly?.temperature_2m ?? [];
  const temps = new Map();
  for (let i = 0; i < times.length; i += 1) {
    // "2026-01-21T00:00" -> hour key "2026-01-21T00"; matches Date.toISOString().slice(0,13).
    temps.set(String(times[i]).slice(0, 13), values[i]);
  }

  cache.set(key, { at: Date.now(), temps });
  return temps;
}
