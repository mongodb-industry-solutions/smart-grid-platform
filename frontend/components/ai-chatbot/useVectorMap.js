"use client";

import { useCallback, useState } from "react";

/**
 * Fetches the 2D vector map (KB points + query position + retrieved hits) for a
 * query. Vectors are computed server-side with the Voyage key.
 */
export function useVectorMap() {
  const [map, setMap] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (query) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-chatbot/vector-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMap(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { map, isLoading, error, run };
}
