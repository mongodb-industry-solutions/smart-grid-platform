import { useEffect, useState } from "react";

// Builds the model endpoint URL for a given scope.
function modelUrl(scope, component, dataid) {
  if (scope === "monitoring") {
    return `/api/monitoring-panel/model?component=${encodeURIComponent(component)}`;
  }
  if (scope === "forecasting") {
    return `/api/network/model?component=${encodeURIComponent(component)}`;
  }
  return `/api/customers/${dataid}/model?component=${encodeURIComponent(component)}`;
}

/**
 * Fetches the documents + operations for one component, only while `enabled`
 * (its modal is open). Works for both the customers view (needs a dataid) and
 * the monitoring panel (global, no dataid).
 *
 * @param {"customers"|"monitoring"} scope which view the component belongs to
 * @param {string} component component key
 * @param {number|null} dataid selected customer id (customers scope only)
 * @param {boolean} enabled whether to fetch (modal open)
 */
export function useModelData(scope, component, dataid, enabled) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const needsDataid = scope === "customers";

  useEffect(() => {
    if (!enabled || (needsDataid && dataid == null)) return;

    let isActive = true;
    setIsLoading(true);
    setError(null);
    setData(null);

    const fetchModel = async () => {
      try {
        const res = await fetch(modelUrl(scope, component, dataid));
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
  }, [scope, component, dataid, enabled, needsDataid]);

  return { data, isLoading, error };
}
