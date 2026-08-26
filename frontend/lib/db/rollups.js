const STALENESS_THRESHOLD_MS = 60_000; // 60 seconds

export async function readRollup(db, collectionName, query = {}) {
  const doc = await db.collection(collectionName).findOne(query);
  if (!doc) return null;

  const age = Date.now() - new Date(doc.refreshed_at).getTime();
  return { data: doc, isStale: age > STALENESS_THRESHOLD_MS, age };
}

export async function readRollupAll(db, collectionName, query = {}) {
  const docs = await db.collection(collectionName).find(query).toArray();
  if (!docs.length) return null;

  const newest = docs.reduce((max, d) => {
    const t = new Date(d.refreshed_at).getTime();
    return t > max ? t : max;
  }, 0);
  const age = Date.now() - newest;
  return { data: docs, isStale: age > STALENESS_THRESHOLD_MS, age };
}
