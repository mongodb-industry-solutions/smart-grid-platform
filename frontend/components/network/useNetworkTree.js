import { useEffect, useState } from "react";

/**
 * Fetches the grid hierarchy as a nested tree of utilities → substations →
 * feeders → transformers (with meter ids on the leaves). Small, stable data, so
 * it loads once. See GET /api/network/tree.
 */
export function useNetworkTree() {
  const [tree, setTree] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isActive = true;
    (async () => {
      try {
        const res = await fetch("/api/network/tree");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Request failed");
        if (isActive) setTree(json.tree ?? []);
      } catch (err) {
        if (isActive) setError(err.message);
      } finally {
        if (isActive) setIsLoading(false);
      }
    })();
    return () => {
      isActive = false;
    };
  }, []);

  return { tree, isLoading, error };
}
