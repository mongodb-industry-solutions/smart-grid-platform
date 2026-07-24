const NETWORK_COLLECTION = process.env.NETWORK_COLLECTION_NAME || "network";
const NETWORK_MAP_COLLECTION =
  process.env.NETWORK_MAP_COLLECTION_NAME || "meter_network_map";

// Utility roots to hide app-wide (non-destructive — the DB is left untouched).
const EXCLUDED_UTILITY_IDS = ["utility_san_antonio"];

/**
 * Builds the grid hierarchy as a nested tree
 * (utility → substation → feeder → transformer), attaching each transformer's
 * meter dataids from meter_network_map.
 *
 * The `network` collection is small (~100 docs), so we read it whole and walk it
 * in memory via `parent_asset_id` rather than a recursive $graphLookup — simpler
 * and cheaper at this size. Each node matches the shape the map component wants:
 *   { id, name, type, capacityKw, status, city, lon, lat, children,
 *     meters? }   // meters only on transformers (leaves)
 *
 * @param {import("mongodb").Db} db connected MongoDB database handle
 * @returns {Promise<{ tree: object[] }>} root utilities
 */
export async function getNetworkTree(db) {
  const [assets, meterRows] = await Promise.all([
    db
      .collection(NETWORK_COLLECTION)
      .find(
        {},
        {
          projection: {
            _id: 0,
            asset_id: 1,
            asset_type: 1,
            name: 1,
            capacity_kw: 1,
            status: 1,
            city: 1,
            state: 1,
            parent_asset_id: 1,
            location: 1,
          },
        }
      )
      .toArray(),
    db
      .collection(NETWORK_MAP_COLLECTION)
      .find({}, { projection: { _id: 0, dataid: 1, transformer_id: 1 } })
      .toArray(),
  ]);

  // Meter dataids grouped by their transformer.
  const metersByTransformer = new Map();
  for (const row of meterRows) {
    if (!metersByTransformer.has(row.transformer_id)) {
      metersByTransformer.set(row.transformer_id, []);
    }
    metersByTransformer.get(row.transformer_id).push(row.dataid);
  }

  // Materialize each asset as a tree node.
  const nodeById = new Map();
  for (const a of assets) {
    const coords = a.location?.coordinates ?? [];
    const node = {
      id: a.asset_id,
      name: a.name,
      type: a.asset_type,
      capacityKw: a.capacity_kw ?? null,
      status: a.status ?? null,
      city: a.city ?? null,
      lon: coords[0] ?? null,
      lat: coords[1] ?? null,
      children: [],
    };
    // Only transformers (leaves) carry meters.
    if (a.asset_type === "transformer") {
      node.meters = (metersByTransformer.get(a.asset_id) ?? []).sort((x, y) => x - y);
    }
    nodeById.set(a.asset_id, node);
  }

  // Link children to parents; assets with no (known) parent are roots.
  const roots = [];
  for (const a of assets) {
    const node = nodeById.get(a.asset_id);
    const parent = a.parent_asset_id ? nodeById.get(a.parent_asset_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  // Stable alphabetical ordering at every level.
  const sortRec = (n) => {
    n.children.sort((x, y) => x.name.localeCompare(y.name));
    n.children.forEach(sortRec);
  };
  roots.sort((x, y) => x.name.localeCompare(y.name));
  roots.forEach(sortRec);

  const visible = roots.filter((r) => !EXCLUDED_UTILITY_IDS.includes(r.id));

  return { tree: visible };
}
