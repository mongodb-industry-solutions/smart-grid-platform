"use client";

import { Error as ErrorText } from "@leafygreen-ui/typography";
import Badge from "@leafygreen-ui/badge";
import styles from "../../style/customers/customers.module.css";

const fmt = (value, decimals) =>
  value != null ? value.toFixed(decimals) : "N/A";

// One label/value row.
function Field({ label, value }) {
  return (
    <div className={styles.fieldRow}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{value}</span>
    </div>
  );
}

// Card shell for the loading / error / empty states.
function StateCard({ children }) {
  return (
    <div className={styles.card}>
      <div className={styles.empty}>{children}</div>
    </div>
  );
}

export default function CustomerProfile({ customer, isLoading, error }) {
  if (isLoading) return <StateCard>Loading profile…</StateCard>;
  if (error) return <StateCard><ErrorText>Error: {error}</ErrorText></StateCard>;
  if (!customer) return <StateCard>Select a customer to see details.</StateCard>;

  const { tariff, latestReading } = customer;

  return (
    <div className={`${styles.card} ${styles.profile}`}>
      <div className={styles.profileHeader}>
        <span className={`${styles.avatar} ${styles.profileAvatar}`}>
          {customer.city?.[0]?.toUpperCase() ?? "?"}
        </span>
        <div>
          <div className={styles.profileName}>Customer {customer.dataid}</div>
          {tariff?.rateName && <Badge variant="green">{tariff.rateName}</Badge>}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Account</div>
        <Field label="Customer ID" value={customer.dataid} />
        <Field label="Meter ID" value={customer.dataid} />
        <Field label="Location" value={customer.locationLabel} />
      </div>

      {latestReading && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            Latest reading
            {latestReading.timestamp &&
              ` · ${new Date(latestReading.timestamp).toLocaleDateString()}`}
          </div>
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <div className={styles.metricLabel}>Energy</div>
              <div className={styles.metricValue}>
                {fmt(latestReading.energy, 2)} kWh
              </div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricLabel}>Power</div>
              <div className={styles.metricValue}>
                {fmt(latestReading.power, 1)} W
              </div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricLabel}>Voltage</div>
              <div className={styles.metricValue}>
                {fmt(latestReading.voltage, 1)} V
              </div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricLabel}>Current</div>
              <div className={styles.metricValue}>
                {fmt(latestReading.current, 2)} A
              </div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricLabel}>Power factor</div>
              <div className={styles.metricValue}>
                {fmt(latestReading.powerFactor, 3)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
