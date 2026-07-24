const NETWORK_MAP_COLLECTION =
  process.env.NETWORK_MAP_COLLECTION_NAME || "meter_network_map";
const NETWORK_COLLECTION = process.env.NETWORK_COLLECTION_NAME || "network";

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

/**
 * Hierarchy-aware options for the demand-peaks view: the grid nodes at each
 * level (utility → substation → feeder), each cascading-scoped by the selected
 * parents, with human labels from the `network` collection's `name`.
 *
 * @param {import("mongodb").Db} db
 * @param {{ utilities?: string[], substations?: string[] }} [selection]
 * @returns {Promise<{
 *   utilities: Array<{id:string,label:string}>,
 *   substations: Array<{id:string,label:string}>,
 *   feeders: Array<{id:string,label:string}>
 * }>}
 */
export async function getNetworkHierarchy(db, selection = {}) {
  const utilities = selection.utilities ?? [];
  const substations = selection.substations ?? [];
  const map = db.collection(NETWORK_MAP_COLLECTION);

  const subFilter = utilities.length ? { utility_id: { $in: utilities } } : {};
  const feederFilter = {
    ...(utilities.length ? { utility_id: { $in: utilities } } : {}),
    ...(substations.length ? { substation_id: { $in: substations } } : {}),
  };

  const [utils, subs, feeders] = await Promise.all([
    map.distinct("utility_id"),
    map.distinct("substation_id", subFilter),
    map.distinct("feeder_id", feederFilter),
  ]);

  // One lookup for all labels; asset_id in `network` matches these ids.
  const ids = [...utils, ...subs, ...feeders].filter(Boolean);
  const netRows = ids.length
    ? await db
        .collection(NETWORK_COLLECTION)
        .find(
          { asset_id: { $in: ids } },
          { projection: { _id: 0, asset_id: 1, name: 1 } }
        )
        .toArray()
    : [];
  const nameOf = new Map(netRows.map((n) => [n.asset_id, n.name]));
  const label = (id) => ({ id, label: nameOf.get(id) || id });

  return {
    utilities: utils.filter(Boolean).sort().map(label),
    substations: subs.filter(Boolean).sort().map(label),
    feeders: feeders.filter(Boolean).sort().map(label),
  };
}
