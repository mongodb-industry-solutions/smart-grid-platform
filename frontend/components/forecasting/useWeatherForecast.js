import { useEffect, useState } from "react";

const EMPTY = { regions: [], region: null, points: [], nowIndex: 0 };

/**
 * Fetches the weather-adjusted hourly demand forecast for a customer region.
 * The response also carries the full region list, so a single request both
 * populates the selector and returns the (default or selected) region's series.
 * Stale-while-revalidate: the previous series stays on screen while the next
 * loads. See GET /api/forecast/weather.
 *
 * @param {string|null} regionId selected region id ("City, State"), or null for default
 */
export function useWeatherForecast(regionId) {
  const [result, setResult] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    let isActive = true;
    setIsRefreshing(true);
    setError(null);

    const params = new URLSearchParams();
    if (regionId) params.set("region", regionId);

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
  }, [regionId]);

  const isLoading = isRefreshing && !hasLoaded;
  return { ...result, isLoading, isRefreshing, error };
}
