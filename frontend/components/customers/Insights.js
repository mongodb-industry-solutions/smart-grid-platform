"use client";

import { useCustomerInsights } from "./useCustomerInsights";
import ShowDocButton from "./ShowDocButton";
import styles from "../../style/customers/customers.module.css";

// 0–23 hour → "6:00 PM" style label.
function fmtHour(hour) {
  if (hour == null) return "—";
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${period}`;
}

function fmtKwh(kwh) {
  if (kwh == null) return "—";
  return `${kwh.toLocaleString()} kWh`;
}

export default function Insights({ dataid }) {
  const { data, isLoading, error } = useCustomerInsights(dataid);

  if (!dataid) {
    return (
      <div className={styles.card}>
        <div className={styles.empty}>Select a customer to view insights.</div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <ShowDocButton component="insights" dataid={dataid} />
      <div className={styles.cardTitle}>Insights</div>

      {isLoading && !data ? (
        <div className={styles.segmentSkeleton} />
      ) : error ? (
        <div className={styles.empty} style={{ color: "#DB3030" }}>{error}</div>
      ) : data ? (
        <div className={styles.insightsBody}>
          <div className={styles.insightMetric}>
            <span className={styles.insightLabel}>Peak time</span>
            <span className={styles.insightValue}>{fmtHour(data.peakHour)}</span>
            <span className={styles.insightSub}>
              {data.peakKw != null ? `≈ ${data.peakKw} kW avg draw` : " "}
            </span>
          </div>

          <div className={styles.insightDivider} />

          <div className={styles.insightMetric}>
            <span className={styles.insightLabel}>Monthly consumption</span>
            <span className={styles.insightValue}>{fmtKwh(data.monthlyKwh)}</span>
            <span className={styles.insightSub}>estimated</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
