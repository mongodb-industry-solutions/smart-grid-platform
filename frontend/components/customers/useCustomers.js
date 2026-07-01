import { useEffect, useState } from "react";

const CUSTOMERS_ENDPOINT = "/api/customers";

/**
 * Fetches the customers list (location + tariff + latest usage) on mount.
 *
 * @returns {{ customers: Array, isLoading: boolean, error: string|null }}
 */
export function useCustomers() {
  const [customers, setCustomers] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    const fetchCustomers = async () => {
      try {
        const res = await fetch(CUSTOMERS_ENDPOINT);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Request failed");
        }
        if (isActive) setCustomers(data.customers ?? []);
      } catch (err) {
        if (isActive) setError(err.message);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    fetchCustomers();

    return () => {
      isActive = false;
    };
  }, []);

  return { customers, isLoading, error };
}
