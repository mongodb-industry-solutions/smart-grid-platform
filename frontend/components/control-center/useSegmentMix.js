import { useEffect, useState } from "react";

const ENDPOINT = "/api/control-center/segment-mix";

/**
 * Fetches the regional customer-segment / tariff mix on scope change. Not
 * polled — the mix reruns the per-customer tariff recommendation, so it refetches
 * only when the selected scope changes (like useTariffRecommendation).
 *
 * @param {string} scope a utility asset id, or "all"
 */
export function useSegmentMix(scope = "all") {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);

    (async () => {
      try {
        const res = await fetch(`${ENDPOINT}?scope=${encodeURIComponent(scope)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Request failed");
        if (isActive) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (isActive) setError(err.message);
      } finally {
        if (isActive) setIsLoading(false);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [scope]);

  return { data, isLoading, error };
}
