import { useEffect, useState } from "react";

const ANOMALIES_ENDPOINT = "/api/monitoring-panel/anomalies";
const TICK_MS = 10_000;

/**
 * Fetches detected anomalies from the monitoring API, refetching whenever the
 * sigma threshold changes. Anomalies are computed by comparing the latest
 * reading (from latest_readings) against a baseline from the time-series.
 *
 * @param {number} threshold sigma multiple above which a metric is flagged
 * @returns {{ anomalies: Array, isLoading: boolean, error: string|null }}
 */
export function useAnomalies(threshold) {
  const [anomalies, setAnomalies] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;
    let isFirst = true;

    const fetchAnomalies = async () => {
      if (isFirst) setIsLoading(true);
      try {
        const res = await fetch(
          `${ANOMALIES_ENDPOINT}?threshold=${threshold}`
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Request failed");
        }
        if (!isActive) return;

        setAnomalies(data.anomalies ?? []);
        setError(null);
      } catch (err) {
        if (isActive) setError(err.message);
      } finally {
        if (isActive) {
          setIsLoading(false);
          isFirst = false;
        }
      }
    };

    fetchAnomalies();
    const id = setInterval(fetchAnomalies, TICK_MS);

    return () => {
      isActive = false;
      clearInterval(id);
    };
  }, [threshold]);

  return { anomalies, isLoading, error };
}
