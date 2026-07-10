import { useEffect, useState } from "react";

const EMPTY = { utilities: [], substations: [], feeders: [] };

/**
 * Fetches the grid-node options for each granularity level (utility /
 * substation / feeder), each as `{ id, label }`. Small, stable lists, so this
 * loads once. See GET /api/network/hierarchy.
 */
export function useNetworkHierarchy() {
  const [options, setOptions] = useState(EMPTY);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isActive = true;
    (async () => {
      try {
        const res = await fetch("/api/network/hierarchy");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Request failed");
        if (isActive) {
          setOptions({
            utilities: json.utilities ?? [],
            substations: json.substations ?? [],
            feeders: json.feeders ?? [],
          });
        }
      } catch (err) {
        if (isActive) setError(err.message);
      }
    })();
    return () => {
      isActive = false;
    };
  }, []);

  return { ...options, error };
}
