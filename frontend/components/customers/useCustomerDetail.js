import { useEffect, useState } from "react";

const CUSTOMERS_ENDPOINT = "/api/customers";

/**
 * Fetches the full detail for a single customer whenever the selected id
 * changes. Does nothing while `dataid` is null/undefined.
 *
 * @param {number|null} dataid the selected customer/meter id
 * @returns {{ customer: object|null, isLoading: boolean, error: string|null }}
 */
export function useCustomerDetail(dataid) {
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (dataid == null) return;

    let isActive = true;
    setIsLoading(true);
    setError(null);

    const fetchDetail = async () => {
      try {
        const res = await fetch(`${CUSTOMERS_ENDPOINT}/${dataid}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Request failed");
        }
        if (isActive) setCustomer(data.customer);
      } catch (err) {
        if (isActive) setError(err.message);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    fetchDetail();

    return () => {
      isActive = false;
    };
  }, [dataid]);

  return { customer, isLoading, error };
}
