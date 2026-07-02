import { useEffect, useState } from "react";

/**
 * Fetches the cascading network filter options (states, feeders, meters).
 * Selections are multi-select, so `states` and `feeders` are arrays. Refetches
 * whenever they change so the downstream options stay narrowed.
 *
 * @param {string[]} states selected regions (states)
 * @param {string[]} feeders selected feeder_ids
 * @returns {{ states: string[], feeders: string[], meters: Array, isLoading: boolean, error: string|null }}
 */
export function useNetworkFilters(states, feeders) {
  const [data, setData] = useState({ states: [], feeders: [], meters: [] });
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Stable dependency keys so the effect only reruns on real changes.
  const statesKey = states.join(",");
  const feedersKey = feeders.join(",");

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (statesKey) params.set("states", statesKey);
    if (feedersKey) params.set("feeders", feedersKey);

    const fetchFilters = async () => {
      try {
        const res = await fetch(`/api/network/filters?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Request failed");
        if (isActive) {
          setData({
            states: json.states ?? [],
            feeders: json.feeders ?? [],
            meters: json.meters ?? [],
          });
        }
      } catch (err) {
        if (isActive) setError(err.message);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    fetchFilters();

    return () => {
      isActive = false;
    };
  }, [statesKey, feedersKey]);

  return { ...data, isLoading, error };
}
