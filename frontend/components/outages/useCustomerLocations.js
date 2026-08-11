import { useEffect, useState } from "react";

const LOCATIONS_ENDPOINT = "/api/monitoring-panel/customer-locations";
const TICK_MS = 5_000;

/**
 * Fetches customer locations (city/state/count) from the monitoring API on mount.
 *
 * @returns {{ locations: Array, isLoading: boolean, error: string|null }}
 *   the location list plus loading and error state
 */
export function useCustomerLocations() {
  const [locations, setLocations] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    const fetchLocations = async () => {
      try {
        const res = await fetch(LOCATIONS_ENDPOINT);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Request failed");
        }
        if (isActive) setLocations(data.locations ?? []);
      } catch (err) {
        if (isActive) setError(err.message);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    fetchLocations();
    const intervalId = setInterval(fetchLocations, TICK_MS);

    // Refresh right away when an outage is added (instead of waiting for the poll),
    // so the new red dot appears within ~1s.
    const onOutageAdded = () => fetchLocations();
    window.addEventListener("outage:added", onOutageAdded);

    return () => {
      isActive = false;
      clearInterval(intervalId);
      window.removeEventListener("outage:added", onOutageAdded);
    };
  }, []);

  return { locations, isLoading, error };
}
