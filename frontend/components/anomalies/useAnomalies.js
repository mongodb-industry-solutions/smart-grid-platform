import { useEffect, useState } from "react";

const ANOMALIES_ENDPOINT = "/api/monitoring-panel/anomalies";
const TICK_MS = 2_000;

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
    let isFirst = true;
    let periodIndex = 0;

    const fetchAnomalies = async () => {
      if (isFirst) setIsLoading(true); // only the first load shows the spinner
      try {
        const res = await fetch(
          `${ANOMALIES_ENDPOINT}?threshold=${threshold}&periodIndex=${periodIndex}`
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Request failed");
        }
        if (!isActive) return;

        const list = data.anomalies ?? [];
        // Empty means we ran past the last period — loop back to the start.
        if (list.length === 0 && periodIndex > 0) {
          periodIndex = 0;
        } else {
          setAnomalies(list);
          setError(null);
          periodIndex += 1;
        }
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
