import { useEffect, useState } from "react";

const EMPTY = { regions: [], region: null, points: [], nowIndex: 0 };

/**
 * Fetches the weather-adjusted hourly demand forecast for a customer region.
 * The response also carries the full region list, so a single request both
 * populates the selector and returns the (default or selected) region's series.
 * Stale-while-revalidate: the previous series stays on screen while the next
 * loads. See GET /api/forecast/weather.
 *
 * Driven by the same region/feeder/meter selection as the demand forecast, so
 * both charts move together. An empty selection means "all" (the API picks a
 * default region).
 *
 * @param {string[]} states selected regions
 * @param {string[]} feeders selected feeder_ids
 * @param {string[]} meterIds selected meter ids
 */
export function useWeatherForecast(states, feeders, meterIds) {
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

    (async () => {
      try {
        const res = await fetch(`/api/forecast/weather?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Request failed");
        if (isActive) {
          setResult({
            regions: json.regions ?? [],
            region: json.region ?? null,
            points: json.points ?? [],
            nowIndex: json.nowIndex ?? 0,
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
  }, [statesKey, feedersKey, idsKey]);

  const isLoading = isRefreshing && !hasLoaded;
  return { ...result, isLoading, isRefreshing, error };
}
