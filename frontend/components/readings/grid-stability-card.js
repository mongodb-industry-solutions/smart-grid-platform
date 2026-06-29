"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { H2, Body } from "@leafygreen-ui/typography";
import styles from "../../style/readings/grid-stability-card.module.css";

const GaugeChart = dynamic(() => import("react-gauge-chart"), { ssr: false });

const TICK_MS = 30_000;

const WINDOWS = [
  { value: "1h",  label: "Last hour" },
  { value: "6h",  label: "Last 6 hours" },
  { value: "24h", label: "Last 24 hours" },
];

// ── Network model thresholds (placeholder — replace when available in DB) ──
const THRESHOLD_ELEVATED_PCT = 5;
const THRESHOLD_CRITICAL_PCT = 20;
const GAUGE_MAX_PCT          = 35;

const STATUS = {
  normal:   { label: "Normal",   description: "Consumption within expected range" },
  elevated: { label: "Elevated", description: "Consumption rising — monitor closely" },
  critical: { label: "Critical", description: "Consumption at peak — grid under stress" },
};

function deriveStatus(pctChange) {
  if (pctChange > THRESHOLD_CRITICAL_PCT) return "critical";
  if (pctChange > THRESHOLD_ELEVATED_PCT) return "elevated";
  return "normal";
}

export default function GridStabilityCard() {
  const [data, setData]     = useState(null);
  const [window, setWindow] = useState("1h");
  const [error, setError]   = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/monitoring-panel/usage-change?window=${window}`);
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
  }, [window]);

  const statusKey = data ? deriveStatus(data.pctChange) : "normal";
  const status    = STATUS[statusKey];
  const percent   = data
    ? Math.min(Math.max(data.pctChange / GAUGE_MAX_PCT, 0), 1)
    : 0;

  return (
    <div className={styles.widget}>
      <div className={styles.cardHeader}>
        <H2>Grid Stability</H2>
        <select
          value={window}
          onChange={(e) => setWindow(e.target.value)}
          className={styles.windowSelect}
        >
          {WINDOWS.map((w) => (
            <option key={w.value} value={w.value}>{w.label}</option>
          ))}
        </select>
      </div>

      <div className={styles.card}>
        {error ? (
          <Body className={styles.errorText}>Error: {error}</Body>
        ) : !data ? (
          <div className={styles.skeleton} />
        ) : (
          <>
            <GaugeChart
              id="grid-stability-gauge"
              nrOfLevels={3}
              colors={["#00684A", "#D4730A", "#DB3030"]}
              arcWidth={0.25}
              arcPadding={0.03}
              cornerRadius={3}
              percent={percent}
              needleColor="#001E2B"
              needleBaseColor="#001E2B"
              hideText
              animate
              animateDuration={700}
              style={{ width: "100%" }}
            />

            <p className={`${styles.statusLabel} ${styles[`statusLabel_${statusKey}`]}`}>
              {status.label}
            </p>
            <p className={styles.description}>{status.description}</p>

            {/* Network model placeholders */}
            <div className={styles.divider} />
            <p className={styles.placeholderHeading}>Network model parameters</p>
            <div className={styles.metrics}>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Grid capacity limit</span>
                <span className={styles.metricPlaceholder}>— pending</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Reserve margin</span>
                <span className={styles.metricPlaceholder}>— pending</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Peak demand forecast</span>
                <span className={styles.metricPlaceholder}>— pending</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
