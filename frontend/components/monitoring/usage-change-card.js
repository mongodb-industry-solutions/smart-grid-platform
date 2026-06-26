"use client";

import { useEffect, useState } from "react";
import { H2, Body } from "@leafygreen-ui/typography";
import styles from "../../style/monitoring/usage-change-card.module.css";

const TICK_MS = 30_000;

const WINDOWS = [
  { value: "1h",  label: "Last hour" },
  { value: "6h",  label: "Last 6 hours" },
  { value: "24h", label: "Last 24 hours" },
];

export default function UsageChangeCard() {
  const [data, setData]           = useState(null);
  const [window, setWindow]       = useState("1h");
  const [error, setError]         = useState("");

  useEffect(() => {
    const fetchChange = async () => {
      try {
        const res = await fetch(
          `/api/monitoring-panel/usage-change?window=${window}`
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
  }, [window]);

  const isDecrease = data ? data.pctChange < 0 : false;
  const isIncrease = data ? data.pctChange > 0 : false;
  const absPct     = data ? Math.abs(data.pctChange) : 0;

  const trendClass = isDecrease
    ? styles.trendDown
    : isIncrease
    ? styles.trendUp
    : styles.trendFlat;

  return (
    <div className={styles.widget}>
      {/* Header (outside the card) */}
      <div className={styles.cardHeader}>
        <H2>Energy Usage</H2>
        <select
          value={window}
          onChange={(e) => setWindow(e.target.value)}
          className={styles.windowSelect}
        >
          {WINDOWS.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
      </div>

      {/* Card */}
      <div className={styles.card}>
        {error ? (
          <Body className={styles.errorText}>Error: {error}</Body>
        ) : !data ? (
          <div className={styles.skeleton} />
        ) : (
          <>
            <div className={`${styles.mainStat} ${trendClass}`}>
              <span className={styles.arrow}>
                {isDecrease ? "↓" : isIncrease ? "↑" : "→"}
              </span>
              <span className={styles.pctValue}>{absPct}%</span>
            </div>

            <p className={styles.trendLabel}>
              {isDecrease ? "less" : isIncrease ? "more" : "same"} than{" "}
              {data.windowLabel}
              {data.usedFallback && (
                <span className={styles.fallbackNote}> (limited history)</span>
              )}
            </p>

            <div className={styles.subStats}>
              <div className={styles.subStat}>
                <span className={styles.subLabel}>Now</span>
                <span className={styles.subValue}>{data.current}</span>
              </div>
              <div className={styles.divider} />
              <div className={styles.subStat}>
                <span className={styles.subLabel}>Before</span>
                <span className={styles.subValue}>{data.previous}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
