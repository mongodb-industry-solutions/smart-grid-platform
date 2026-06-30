"use client";

import { useEffect } from "react";
import { Error as ErrorText } from "@leafygreen-ui/typography";
import Badge from "@leafygreen-ui/badge";
import { useCustomers } from "./useCustomers";
import styles from "../../style/customers/customers.module.css";

// Formats an energy reading as a rounded kWh string.
function formatEnergy(energy) {
  return energy != null ? `${Math.round(energy)} kWh` : "—";
}

// Formats a timestamp as a short month/year label.
function formatMonth(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

export default function CustomersList({ selectedId, onSelect }) {
  const { customers, isLoading, error } = useCustomers();

  // Auto-select the first customer once the list loads.
  useEffect(() => {
    if (selectedId == null && customers.length > 0) {
      onSelect(customers[0].dataid);
    }
  }, [selectedId, customers, onSelect]);

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>
        All Customers{customers.length > 0 && ` (${customers.length})`}
      </div>

      {isLoading && <div className={styles.empty}>Loading customers…</div>}
      {error && (
        <div className={styles.empty}>
          <ErrorText>Error: {error}</ErrorText>
        </div>
      )}

      {!isLoading && !error && (
        <div className={styles.list}>
          {customers.map((customer) => {
            const isSelected = customer.dataid === selectedId;
            return (
              <button
                key={customer.dataid}
                type="button"
                className={`${styles.row} ${isSelected ? styles.rowSelected : ""}`}
                onClick={() => onSelect(customer.dataid)}
              >
                <span className={styles.avatar}>
                  {customer.city?.[0]?.toUpperCase() ?? "?"}
                </span>

                <span className={styles.rowMain}>
                  <span className={styles.rowName}>
                    Customer {customer.dataid}
                  </span>
                  <span className={styles.rowSub}>
                    {customer.locationLabel}
                    {customer.rateName && (
                      <Badge variant="green">{customer.rateName}</Badge>
                    )}
                  </span>
                </span>

                <span className={styles.rowRight}>
                  <span className={styles.rowUsage}>
                    {formatEnergy(customer.energy)}
                  </span>
                  <span className={styles.rowDate}>
                    {formatMonth(customer.lastReadingAt)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
