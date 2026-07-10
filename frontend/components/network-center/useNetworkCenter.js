import { useEffect, useState } from "react";

const ENDPOINT = "/api/network-center/overview";
const TICK_MS = 5_000;

/**
 * Live grid network-center overview. Polls every 5s (the project's convention
 * for "live" panels — there are no change streams here) and pulses `tick` on
 * each successful refresh so the header live indicator can flash.
 *
 * @param {string} scope a utility asset id, or "all"
 */
export function useNetworkCenter(scope = "all") {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let isActive = true;

    const fetchOverview = async () => {
      try {
        const res = await fetch(`${ENDPOINT}?scope=${encodeURIComponent(scope)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Request failed");
        if (isActive) {
          setData(json);
          setError(null);
          setTick((t) => t + 1);
        }
      } catch (err) {
        if (isActive) setError(err.message);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    fetchOverview();
    const intervalId = setInterval(fetchOverview, TICK_MS);

    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [scope]);

  return { data, isLoading, error, tick };
}
