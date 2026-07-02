const NETWORK_MAP_COLLECTION =
  process.env.NETWORK_MAP_COLLECTION_NAME || "meter_network_map";

/**
 * Cascading filter options for the demand explorer, sourced from
 * meter_network_map. Selected regions narrow the feeders, and regions + feeders
 * narrow the meters — all multi-select, so each argument is a list.
 *
 * @param {import("mongodb").Db} db connected MongoDB database handle
 * @param {{ states?: string[], feederIds?: string[] }} [selection]
 * @returns {Promise<{
 *   states: string[],
 *   feeders: string[],
 *   meters: Array<{ dataid: number|string, city: string, state: string, feeder_id: string }>
 * }>}
 */
export async function getNetworkFilters(db, selection = {}) {
  const states = selection.states ?? [];
  const feederIds = selection.feederIds ?? [];
  const map = db.collection(NETWORK_MAP_COLLECTION);

  const feederFilter = states.length ? { state: { $in: states } } : {};
  const meterFilter = {
    ...(states.length ? { state: { $in: states } } : {}),
    ...(feederIds.length ? { feeder_id: { $in: feederIds } } : {}),
  };

  const [allStates, feeders, meters] = await Promise.all([
    map.distinct("state"),
    map.distinct("feeder_id", feederFilter),
    map
      .find(meterFilter, {
        projection: { _id: 0, dataid: 1, city: 1, state: 1, feeder_id: 1 },
      })
      .sort({ dataid: 1 })
      .limit(500)
      .toArray(),
  ]);

  return {
    states: allStates.filter(Boolean).sort(),
    feeders: feeders.filter(Boolean).sort(),
    meters,
  };
}
