import { useEffect, useState } from "react";

const EMPTY = { level: "feeder", window: null, pipeline: [], capacityPipeline: [], regions: [] };

/**
 * Fetches the per-region demand forecast (historical + projected series, peak
 * metadata, % of capacity) for the selected granularity + regions. Stale-while-
 * revalidate: the previous result stays on screen while the next loads, so
 * changing the selection never flashes empty. See GET /api/network/forecast.
 *
 * @param {"utility"|"substation"|"feeder"} level
 * @param {string[]} regionIds region node ids to compare
 * @param {number} [horizonHours=24]
 */
export function useRegionalForecast(level, regionIds, horizonHours = 24) {
  const [result, setResult] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const idsKey = (regionIds ?? []).join(",");

  useEffect(() => {
    // Nothing selected → clear and skip the request.
    if (!idsKey) {
      setResult(EMPTY);
      setHasLoaded(true);
      return;
    }

    let isActive = true;
    setIsRefreshing(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("level", level);
    params.set("ids", idsKey);
    params.set("horizon", String(horizonHours));

    (async () => {
      try {
        const res = await fetch(`/api/network/forecast?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Request failed");
        if (isActive) {
          setResult({
            level: json.level ?? level,
            window: json.window ?? null,
            pipeline: json.pipeline ?? [],
            capacityPipeline: json.capacityPipeline ?? [],
            regions: json.regions ?? [],
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
    })();

    return () => {
      isActive = false;
    };
  }, [level, idsKey, horizonHours]);

  const isLoading = isRefreshing && !hasLoaded;
  return { ...result, isLoading, isRefreshing, error };
}
