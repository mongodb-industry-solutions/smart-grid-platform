import { useEffect, useState } from "react";

const ANOMALIES_ENDPOINT = "/api/monitoring-panel/anomalies";

/**
 * Fetches detected anomalies from the monitoring API, refetching whenever the
 * sigma threshold changes.
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

    const fetchAnomalies = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${ANOMALIES_ENDPOINT}?threshold=${threshold}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Request failed");
        }
        if (isActive) {
          setAnomalies(data.anomalies ?? []);
          setError(null);
        }
      } catch (err) {
        if (isActive) setError(err.message);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    fetchAnomalies();

    return () => {
      isActive = false;
    };
  }, [threshold]);

  return { anomalies, isLoading, error };
}
