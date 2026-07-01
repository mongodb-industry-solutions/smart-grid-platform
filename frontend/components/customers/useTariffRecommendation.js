import { useEffect, useState } from "react";

const CUSTOMERS_ENDPOINT = "/api/customers";

/**
 * Fetches the tariff recommendation for a customer whenever the selection
 * changes. Does nothing while `dataid` is null/undefined.
 *
 * @param {number|null} dataid the selected customer/meter id
 * @returns {{ recommendation: object|null, isLoading: boolean, error: string|null }}
 */
export function useTariffRecommendation(dataid) {
  const [recommendation, setRecommendation] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (dataid == null) return;

    let isActive = true;
    setIsLoading(true);
    setError(null);

    const fetchRecommendation = async () => {
      try {
        const res = await fetch(
          `${CUSTOMERS_ENDPOINT}/${dataid}/tariff-recommendation`
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Request failed");
        }
        if (isActive) setRecommendation(data.recommendation);
      } catch (err) {
        if (isActive) setError(err.message);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    fetchRecommendation();

    return () => {
      isActive = false;
    };
  }, [dataid]);

  return { recommendation, isLoading, error };
}
