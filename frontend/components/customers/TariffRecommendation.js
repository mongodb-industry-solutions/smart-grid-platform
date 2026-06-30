"use client";

import { Body, Error as ErrorText } from "@leafygreen-ui/typography";
import { useTariffRecommendation } from "./useTariffRecommendation";
import styles from "../../style/customers/tariff-recommendation.module.css";

const fmt2 = (n) => (n != null ? n.toFixed(2) : "—");

// Card shell for the loading / error / empty states.
function StateCard({ children }) {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>Tariff Recommendation</span>
        <span className={styles.ribbon}>★</span>
      </div>
      {children}
    </div>
  );
}

export default function TariffRecommendation({ dataid }) {
  const { recommendation, isLoading, error } = useTariffRecommendation(dataid);

  if (dataid == null)
    return <StateCard><Body>Select a customer.</Body></StateCard>;
  if (isLoading)
    return <StateCard><Body>Loading recommendation…</Body></StateCard>;
  if (error)
    return <StateCard><ErrorText>Error: {error}</ErrorText></StateCard>;
  if (!recommendation) return null;

  const {
    plan,
    components,
    total,
    monthlyKwh,
    peakKw,
    loadFactor,
    powerFactor,
    assumptions,
  } = recommendation;

  // Signed amount for the pattern adjustment (can be a discount or surcharge).
  const patternClass =
    components.pattern < 0
      ? styles.valueGreen
      : components.pattern > 0
      ? styles.valueAmber
      : "";
  const patternSign =
    components.pattern < 0 ? "−" : components.pattern > 0 ? "+" : "";

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>Tariff Recommendation</span>
        <span className={styles.ribbon}>★</span>
      </div>

      <div className={styles.label}>Estimated Plan</div>
      <div className={styles.planName}>{plan.name}</div>

      <div className={styles.total}>
        <span className={styles.totalAmount}>${fmt2(total)}</span>
        <span className={styles.totalUnit}>/mo</span>
      </div>
      <div className={styles.totalNote}>estimated personalized tariff</div>

      <ul className={styles.breakdown}>
        <li className={styles.breakdownRow}>
          <span className={styles.breakdownLabel}>Fixed charge</span>
          <span className={styles.breakdownValue}>${fmt2(components.fixed)}</span>
        </li>
        <li className={styles.breakdownRow}>
          <span className={styles.breakdownLabel}>Energy</span>
          <span className={styles.breakdownValue}>
            ${fmt2(components.energy)}
          </span>
        </li>
        <li className={styles.breakdownRow}>
          <span className={styles.breakdownLabel}>
            Demand · peak {peakKw} kW
          </span>
          <span className={styles.breakdownValue}>
            ${fmt2(components.demand)}
          </span>
        </li>
        <li className={styles.breakdownRow}>
          <span className={styles.breakdownLabel}>Pattern adjustment</span>
          <span className={`${styles.breakdownValue} ${patternClass}`}>
            {patternSign}${fmt2(Math.abs(components.pattern))}
          </span>
        </li>
      </ul>

      <div className={styles.note}>
        ~{monthlyKwh} kWh/mo · PF {powerFactor ?? "—"} · load factor{" "}
        {loadFactor ?? "—"}
      </div>
      <div className={styles.assumption}>
        Demand rate ${assumptions.demandRate}/kW · pattern adj. (demo
        assumptions)
      </div>
    </div>
  );
}
