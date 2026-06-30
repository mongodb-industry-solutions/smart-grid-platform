"use client";

import { Error as ErrorText } from "@leafygreen-ui/typography";
import Badge from "@leafygreen-ui/badge";
import styles from "../../style/customers/customers.module.css";

const fmt = (value, decimals) =>
  value != null ? value.toFixed(decimals) : "N/A";

// Human-readable label for a tier's usage range.
function tierRange(tier, previousMax) {
  const from = previousMax != null ? previousMax : 0;
  if (tier.max == null) return `Over ${from} ${tier.unit}`;
  return `${from}–${tier.max} ${tier.unit}`;
}

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

  const { tariff } = customer;

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

      {tariff && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Tariff</div>
          <Field label="Utility" value={tariff.utilityName} />
          <Field label="Rate plan" value={tariff.rateName} />
          <Field label="Rate type" value={tariff.rateType} />
          <Field
            label="Fixed charge"
            value={`$${tariff.fixedCharge} ${tariff.fixedChargeUnits}`}
          />
          <Field
            label="Effective date"
            value={
              tariff.effectiveDate
                ? new Date(tariff.effectiveDate).toLocaleDateString()
                : "—"
            }
          />
        </div>
      )}

      {tariff?.tiers?.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Energy rate tiers</div>
          <table className={styles.tierTable}>
            <thead>
              <tr>
                <th>Usage</th>
                <th>Rate ($/kWh)</th>
                <th>Adj ($/kWh)</th>
              </tr>
            </thead>
            <tbody>
              {tariff.tiers.map((tier, index) => (
                <tr key={index}>
                  <td>{tierRange(tier, tariff.tiers[index - 1]?.max)}</td>
                  <td>{fmt(tier.rate, 5)}</td>
                  <td>{fmt(tier.adj, 5)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
