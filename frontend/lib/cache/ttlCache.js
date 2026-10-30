// Tiny in-process TTL cache with in-flight de-duplication.
//
// The dashboards poll the same aggregation endpoints every few seconds. With N
// concurrent viewers that is N identical queries against MongoDB per tick. A
// short TTL collapses repeated reads, and the in-flight map collapses
// *simultaneous* misses (e.g. a room full of people whose browsers all fire at
// once) into a single query.
//
// Deliberately per-process and unpersisted: this is a demo-scale load-shedding
// device, not a correctness layer. TTLs are short (seconds), so data stays
// effectively live.

const values = new Map(); // key -> { value, expires }
const inflight = new Map(); // key -> Promise

/**
 * Return the cached value for `key` if fresh, otherwise run `produce()` once,
 * cache the result for `ttlMs`, and share the promise with any concurrent
 * callers asking for the same key.
 */
export async function cached(key, ttlMs, produce) {
  const now = Date.now();
  const hit = values.get(key);
  if (hit && hit.expires > now) return hit.value;

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const value = await produce();
      values.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/** Drop cached entries whose key starts with `prefix` (or all when omitted). */
export function invalidate(prefix) {
  if (!prefix) {
    values.clear();
    return;
  }
  for (const key of values.keys()) {
    if (key.startsWith(prefix)) values.delete(key);
  }
}
