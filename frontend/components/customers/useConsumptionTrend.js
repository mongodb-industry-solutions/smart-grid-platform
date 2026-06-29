import { useEffect, useState } from "react";

const CUSTOMERS_ENDPOINT = "/api/customers";

/**
 * Fetches the consumption trend for a customer, optionally comparing against a
 * specific region. Refetches when the customer or region changes.
 *
 * @param {number|null} dataid the selected customer/meter id
 * @param {string|null} region "City, ST" label to compare against (null = the
 *   customer's own region)
 * @returns {{ data: object|null, isLoading: boolean, error: string|null }}
 */
export function useConsumptionTrend(dataid, region) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (dataid == null) return;

    let isActive = true;
    setIsLoading(true);
    setError(null);

    const fetchTrend = async () => {
      try {
        const query = region ? `?region=${encodeURIComponent(region)}` : "";
        const res = await fetch(
          `${CUSTOMERS_ENDPOINT}/${dataid}/consumption${query}`
        );
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Request failed");
        }
        if (isActive) setData(json);
      } catch (err) {
        if (isActive) setError(err.message);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    fetchTrend();

    return () => {
      isActive = false;
    };
  }, [dataid, region]);

  return { data, isLoading, error };
}
