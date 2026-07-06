import { useEffect, useState } from "react";

const CUSTOMERS_ENDPOINT = "/api/customers";

/**
 * Fetches the "internal logic" (sample documents + aggregation pipelines) for a
 * customer, only while `enabled` (the modal is open).
 *
 * @param {number|null} dataid the selected customer/meter id
 * @param {boolean} enabled whether to fetch (modal open)
 * @returns {{ data: object|null, isLoading: boolean, error: string|null }}
 */
export function useCustomersModel(dataid, enabled) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled || dataid == null) return;

    let isActive = true;
    setIsLoading(true);
    setError(null);
    setData(null);

    const fetchModel = async () => {
      try {
        const res = await fetch(`${CUSTOMERS_ENDPOINT}/${dataid}/model`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Request failed");
        if (isActive) setData(json);
      } catch (err) {
        if (isActive) setError(err.message);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    fetchModel();

    return () => {
      isActive = false;
    };
  }, [dataid, enabled]);

  return { data, isLoading, error };
}
