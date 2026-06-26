// Geographic coordinates ([longitude, latitude]) for the cities present in the
// customers collection. d3-geo projections expect [lng, lat] order.
// Add new entries here as more cities appear in the data.
export const CITY_COORDINATES = {
  "Austin, Texas": [-97.7431, 30.2672],
  "Denver, Colorado": [-104.9903, 39.7392],
};

/**
 * Looks up the [longitude, latitude] for a city/state pair.
 *
 * @param {string} city city name as stored in the customers collection
 * @param {string} state state name as stored in the customers collection
 * @returns {[number, number]|null} the coordinates, or null if unknown
 */
export function getCityCoordinates(city, state) {
  return CITY_COORDINATES[`${city}, ${state}`] ?? null;
}
