"use client";

import { Error as ErrorText } from "@leafygreen-ui/typography";
import ShowDocButton from "./ShowDocButton";
import styles from "../../style/customers/customers.module.css";

const fmt = (value, decimals) =>
  value != null ? value.toFixed(decimals) : "N/A";

function Metric({ label, value }) {
  return (
    <div className={styles.metric}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricValue}>{value}</div>
    </div>
  );
}

function StateCard({ children }) {
  return (
    <div className={styles.card}>
      <div className={styles.empty}>{children}</div>
    </div>
  );
}

export default function CustomerLatestReading({ customer, isLoading, error }) {
  if (isLoading) return <StateCard>Loading reading…</StateCard>;
  if (error) return <StateCard><ErrorText>Error: {error}</ErrorText></StateCard>;
  if (!customer) return <StateCard>Select a customer.</StateCard>;

  const { latestReading } = customer;
  if (!latestReading) return <StateCard>No recent reading.</StateCard>;

  return (
    <div className={styles.card}>
      <ShowDocButton component="latest" dataid={customer.dataid} />
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          Latest reading
          {latestReading.timestamp &&
            ` · ${new Date(latestReading.timestamp).toLocaleDateString()}`}
        </div>
        <div className={styles.metrics}>
          <Metric label="Energy" value={`${fmt(latestReading.energy, 2)} kWh`} />
          <Metric label="Power" value={`${fmt(latestReading.power, 1)} W`} />
          <Metric label="Voltage" value={`${fmt(latestReading.voltage, 1)} V`} />
          <Metric label="Current" value={`${fmt(latestReading.current, 2)} A`} />
          <Metric
            label="Power factor"
            value={fmt(latestReading.powerFactor, 3)}
          />
        </div>
      </div>
    </div>
  );
}
