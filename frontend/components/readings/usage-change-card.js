"use client";

import ShowDocButton from "@/components/customers/ShowDocButton";

import { useEffect, useState } from "react";
import { H2, Body } from "@leafygreen-ui/typography";
import styles from "../../style/readings/usage-change-card.module.css";

const TICK_MS = 30_000;
const WINDOW = "1h";

// "How is this calculated?" copy shown behind the info affordance.
const CRITERIA =
  "Percentage change compares fleet-wide energy (kWh) consumed in the last " +
  "window against the window before it, using each meter's cumulative " +
  "register. It is hidden when the previous window had too little data " +
  "(too few meters or near-zero consumption) to make a fair comparison.";

function formatMinutes(minutes) {
  if (minutes == null) return null;
  if (minutes >= 60) {
    const h = minutes / 60;
    return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
  }
  return `${minutes}m`;
}

export default function UsageChangeCard() {
  const [data, setData]           = useState(null);
  const [error, setError]         = useState("");

  useEffect(() => {
    const fetchChange = async () => {
      try {
        const res = await fetch(
          `/api/monitoring-panel/usage-change?window=${WINDOW}`
        );
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

    fetchChange();
    const intervalId = setInterval(fetchChange, TICK_MS);
    return () => clearInterval(intervalId);
  }, []);

  const hasPct     = data ? data.pctChange != null : false;
  const isDecrease = hasPct && data.pctChange < 0;
  const isIncrease = hasPct && data.pctChange > 0;
  const absPct     = hasPct ? Math.abs(data.pctChange) : 0;

  const trendClass = isDecrease
    ? styles.trendDown
    : isIncrease
    ? styles.trendUp
    : styles.trendFlat;

  const currentWindow  = data ? formatMinutes(data.currentWindowMinutes) : null;

  return (
    <div className={styles.widget}>
      {/* Header (outside the card) */}
      <div className={styles.cardHeader}>
        <H2 className={styles.title}>Energy Usage</H2>
        <span className={styles.info} title={CRITERIA} aria-label={CRITERIA}>
          ⓘ
        </span>
      </div>

      {/* Card */}
      <div className={styles.card}>
        <ShowDocButton scope="monitoring" component="usage" />
        {error ? (
          <Body className={styles.errorText}>Error: {error}</Body>
        ) : !data ? (
          <div className={styles.skeleton} />
        ) : (
          <>
            <div className={`${styles.mainStat} ${trendClass}`}>
              {hasPct ? (
                <>
                  <span className={styles.arrow}>
                    {isDecrease ? "↓" : isIncrease ? "↑" : "→"}
                  </span>
                  <span className={styles.pctValue}>{absPct}%</span>
                </>
              ) : (
                <span className={styles.pctValue} title={data.reason || ""}>
                  —
                </span>
              )}
            </div>

            <p className={styles.trendLabel}>
              {hasPct ? (
                <>
                  {isDecrease ? "less" : isIncrease ? "more" : "same"} than{" "}
                  {data.windowLabel}
                  {data.usedFallback && (
                    <span className={styles.fallbackNote}> (limited history)</span>
                  )}
                </>
              ) : (
                <span className={styles.reasonText}>
                  {data.reason || "Not enough comparable history."}
                </span>
              )}
            </p>

            <div className={styles.subStats}>
              <div className={styles.subStat}>
                <span className={styles.subLabel}>Now</span>
                <span className={styles.subValue}>
                  {data.current} {data.unit ?? "kWh"}
                </span>
              </div>
              <div className={styles.divider} />
              <div className={styles.subStat}>
                <span className={styles.subLabel}>Before</span>
                <span className={styles.subValue}>
                  {data.previous} {data.unit ?? "kWh"}
                </span>
              </div>
            </div>

            <div className={styles.meta}>
              <span className={styles.metaItem}>
                {data.currentMeters} meter{data.currentMeters === 1 ? "" : "s"}
                {currentWindow ? ` · ${currentWindow}` : ""}
              </span>
              <span className={styles.metaSep} />
              <span className={styles.metaItem}>
                vs {data.previousMeters} meter
                {data.previousMeters === 1 ? "" : "s"}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
