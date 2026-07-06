"use client";

import { useState, useMemo, useEffect } from "react";
import { Error as ErrorText } from "@leafygreen-ui/typography";
import Badge from "@leafygreen-ui/badge";
import { useCustomers } from "./useCustomers";
import CustomerFilters from "./CustomerFilters";
import ShowDocButton from "./ShowDocButton";
import styles from "../../style/customers/customers.module.css";

function formatEnergy(energy) {
  return energy != null ? `${Math.round(energy)} kWh` : "—";
}

function formatMonth(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

export default function CustomersList({ selectedId, onSelect }) {
  const { customers, isLoading, error } = useCustomers();
  const [filters, setFilters] = useState({ location: "", rateType: "" });

  const filteredCustomers = useMemo(() => {
    let list = customers;
    if (filters.location) list = list.filter((c) => c.locationLabel === filters.location);
    if (filters.rateType) list = list.filter((c) => c.rateType === filters.rateType);
    return list;
  }, [customers, filters]);

  // Auto-select first visible customer on load and when filters change.
  useEffect(() => {
    if (filteredCustomers.length === 0) {
      onSelect(null);
      return;
    }
    if (selectedId == null || !filteredCustomers.some((c) => c.dataid === selectedId)) {
      onSelect(filteredCustomers[0].dataid);
    }
  }, [filteredCustomers, selectedId, onSelect]);

  const showCount = filteredCustomers.length !== customers.length;

  return (
    <div className={styles.card}>
      <ShowDocButton component="list" dataid={selectedId} />
      <div className={styles.cardTitle}>
        <span>
          Customers
          <span className={styles.customerCount}>
            {showCount ? `${filteredCustomers.length} / ${customers.length}` : customers.length}
          </span>
        </span>
      </div>

      <CustomerFilters
        allCustomers={customers}
        filters={filters}
        setFilters={setFilters}
      />

      {isLoading && <div className={styles.empty}>Loading customers…</div>}
      {error && (
        <div className={styles.empty}>
          <ErrorText>Error: {error}</ErrorText>
        </div>
      )}

      {!isLoading && !error && (
        <div className={styles.list}>
          {filteredCustomers.length === 0 ? (
            <div className={styles.empty}>No customers match the current filters.</div>
          ) : (
            filteredCustomers.map((customer) => {
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
                    <span className={styles.rowName}>Customer {customer.dataid}</span>
                    <span className={styles.rowSub}>
                      {customer.locationLabel}
                      {customer.rateName && (
                        <Badge variant="green">{customer.rateName}</Badge>
                      )}
                    </span>
                  </span>
                  <span className={styles.rowRight}>
                    <span className={styles.rowUsage}>{formatEnergy(customer.energy)}</span>
                    <span className={styles.rowDate}>{formatMonth(customer.lastReadingAt)}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
