import { useEffect, useState } from "react";

const EMPTY = { pipeline: [], regions: [], bars: [] };

/**
 * Fetches the demand-by-region forecast (and the aggregation pipeline behind it)
 * for the current filter selection. The pipeline is built from these same
 * selections, so it grows one `$match` stage at a time as filters are added.
 * Stale-while-revalidate: the previous result stays on screen while the next
 * one loads, so changing filters never flashes empty.
 *
 * @param {string[]} states selected regions
 * @param {string[]} feeders selected feeder_ids
 * @param {string[]} meterIds selected meter ids
 */
export function useDemandForecast(states, feeders, meterIds) {
  const [result, setResult] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const statesKey = (states ?? []).join(",");
  const feedersKey = (feeders ?? []).join(",");
  const idsKey = (meterIds ?? []).map(String).join(",");

  useEffect(() => {
    let isActive = true;
    setIsRefreshing(true);
    setError(null);

    const params = new URLSearchParams();
    if (statesKey) params.set("states", statesKey);
    if (feedersKey) params.set("feeders", feedersKey);
    if (idsKey) params.set("ids", idsKey);

    const fetchForecast = async () => {
      try {
        const res = await fetch(`/api/network/demand?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Request failed");
        if (isActive) {
          setResult({
            pipeline: json.pipeline ?? [],
            regions: json.regions ?? [],
            bars: json.bars ?? [],
          });
        }
      } catch (err) {
        if (isActive) setError(err.message);
      } finally {
        if (isActive) {
          setIsRefreshing(false);
          setHasLoaded(true);
        }
      }
    };

    fetchForecast();

    return () => {
      isActive = false;
    };
  }, [statesKey, feedersKey, idsKey]);

  const isLoading = isRefreshing && !hasLoaded;

  return { ...result, isLoading, isRefreshing, error };
}
