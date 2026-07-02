"use client";

import { useMemo } from "react";
import { Select, Option } from "@leafygreen-ui/select";
import styles from "../../style/customers/customers.module.css";

const RATE_TYPE_LABELS = {
  tou:    "Time-of-Use",
  tiered: "Tiered",
};

export default function CustomerFilters({ allCustomers, filters, setFilters }) {
  const locations = useMemo(
    () => [...new Set(allCustomers.map((c) => c.locationLabel))].filter(Boolean).sort(),
    [allCustomers]
  );

  const rateTypes = useMemo(
    () => [...new Set(allCustomers.map((c) => c.rateType))].filter(Boolean).sort(),
    [allCustomers]
  );

  const hasActive = filters.location || filters.rateType;

  return (
    <div className={styles.filterPanel}>
      <Select
        label="Location"
        value={filters.location}
        onChange={(v) => setFilters((f) => ({ ...f, location: v }))}
        className={styles.filterSelectFull}
      >
        <Option value="">All locations</Option>
        {locations.map((loc) => (
          <Option key={loc} value={loc}>{loc}</Option>
        ))}
      </Select>

      <Select
        label="Rate type"
        value={filters.rateType}
        onChange={(v) => setFilters((f) => ({ ...f, rateType: v }))}
        className={styles.filterSelectFull}
      >
        <Option value="">All types</Option>
        {rateTypes.map((rt) => (
          <Option key={rt} value={rt}>{RATE_TYPE_LABELS[rt] ?? rt}</Option>
        ))}
      </Select>

      {hasActive && (
        <button
          type="button"
          className={styles.filterReset}
          onClick={() => setFilters({ location: "", rateType: "" })}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
