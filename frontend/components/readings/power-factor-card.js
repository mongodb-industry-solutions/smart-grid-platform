"use client";

import ShowDocButton from "@/components/customers/ShowDocButton";

import { useEffect, useState } from "react";
import { H2, Body } from "@leafygreen-ui/typography";
import styles from "../../style/readings/power-factor-card.module.css";

const TICK_MS = 30_000;

// Power-factor quality bands.
const STATUS = {
  good: {
    label: "Good",
    description: "Efficient power delivery",
    className: "statusGood",
  },
  fair: {
    label: "Fair",
    description: "Acceptable — some reactive load",
    className: "statusFair",
  },
  poor: {
    label: "Poor",
    description: "Low efficiency — high reactive load",
    className: "statusPoor",
  },
};

function deriveStatus(powerFactor) {
  if (powerFactor == null) return null;
  if (powerFactor >= 0.95) return "good";
  if (powerFactor >= 0.9) return "fair";
  return "poor";
}

export default function PowerFactorCard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/monitoring-panel/power-factor");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        setData(await res.json());
        setError("");
      } catch (err) {
        setError(err.message);
      }
    };

    fetchData();
    const id = setInterval(fetchData, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const statusKey = data ? deriveStatus(data.powerFactor) : null;
  const status = statusKey ? STATUS[statusKey] : null;

  return (
    <div className={styles.widget}>
      <div className={styles.cardHeader}>
        <H2 className={styles.title}>Power Factor</H2>
      </div>

      <div className={styles.card}>
        <ShowDocButton scope="monitoring" component="power-factor" />
        {error ? (
          <Body className={styles.errorText}>Error: {error}</Body>
        ) : !data || data.powerFactor == null ? (
          <div className={styles.skeleton} />
        ) : (
          <>
            <div className={styles.mainStat}>
              <span className={styles.value}>{data.powerFactor.toFixed(2)}</span>
              {status && (
                <span
                  className={`${styles.statusChip} ${styles[status.className]}`}
                >
                  {status.label}
                </span>
              )}
            </div>

            <p className={styles.description}>{status?.description}</p>

            <div className={styles.subStats}>
              <div className={styles.subStat}>
                <span className={styles.subLabel}>Lowest meter</span>
                <span className={styles.subValue}>
                  {data.min != null ? data.min.toFixed(2) : "—"}
                </span>
              </div>
              <div className={styles.divider} />
              <div className={styles.subStat}>
                <span className={styles.subLabel}>Meters</span>
                <span className={styles.subValue}>{data.sampleSize}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
