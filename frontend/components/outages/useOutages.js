import { useEffect, useState } from "react";

const OUTAGES_ENDPOINT = "/api/monitoring-panel/outages";
const TICK_MS = 5_000;

/**
 * Fetches the outage summary from the monitoring API on mount.
 *
 * @returns {{ summary: object|null, isLoading: boolean, error: string|null }}
 *   the outage summary plus loading and error state
 */
export function useOutages() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    const fetchOutages = async () => {
      try {
        const res = await fetch(OUTAGES_ENDPOINT);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Request failed");
        }
        if (isActive) setSummary(data.summary);
      } catch (err) {
        if (isActive) setError(err.message);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    fetchOutages();
    const intervalId = setInterval(fetchOutages, TICK_MS);

    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, []);

  return { summary, isLoading, error };
}
