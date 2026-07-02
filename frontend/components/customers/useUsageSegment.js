import { useEffect, useState } from "react";

const CUSTOMERS_ENDPOINT = "/api/customers";

/**
 * Fetches the usage segment percentile for a customer.
 * Refetches when the customer changes.
 *
 * @param {number|null} dataid the selected customer/meter id
 * @returns {{ data: object|null, isLoading: boolean, error: string|null }}
 */
export function useUsageSegment(dataid) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (dataid == null) return;

    let isActive = true;
    setIsLoading(true);
    setError(null);

    const fetchSegment = async () => {
      try {
        const res = await fetch(`${CUSTOMERS_ENDPOINT}/${dataid}/segment`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Request failed");
        if (isActive) setData(json);
      } catch (err) {
        if (isActive) setError(err.message);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    fetchSegment();

    return () => {
      isActive = false;
    };
  }, [dataid]);

  return { data, isLoading, error };
}
