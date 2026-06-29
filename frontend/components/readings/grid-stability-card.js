"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie } from "recharts";
import { H2, Body } from "@leafygreen-ui/typography";
import { Select, Option } from "@leafygreen-ui/select";
import styles from "../../style/readings/grid-stability-card.module.css";

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
  normal:   { label: "Normal",   description: "Consumption within expected range",     color: "#00684A" },
  elevated: { label: "Elevated", description: "Consumption rising — monitor closely",  color: "#D4730A" },
  critical: { label: "Critical", description: "Consumption at peak — grid under stress", color: "#DB3030" },
};

// Zone ring: 3 equal arcs as a thin outer band so the thresholds are always visible.
const ZONE_DATA = [
  { value: 1/3, fill: "#00684A" },
  { value: 1/3, fill: "#D4730A" },
  { value: 1/3, fill: "#DB3030" },
];

function deriveStatus(pctChange) {
  if (pctChange > THRESHOLD_CRITICAL_PCT) return "critical";
  if (pctChange > THRESHOLD_ELEVATED_PCT) return "elevated";
  return "normal";
}

const CX = 80, CY = 82;

function HalfDonutGauge({ percent, statusKey }) {
  const fillData = [
    { value: percent,     fill: STATUS[statusKey].color },
    { value: 1 - percent, fill: "#e8edeb" },
  ];

  // Needle tip: angle goes from π (left) to 0 (right) as percent goes 0 → 1.
  // SVG y increases downward, so subtract the sin component.
  const angle = Math.PI * (1 - percent);
  const nx = CX + 46 * Math.cos(angle);
  const ny = CY - 46 * Math.sin(angle);

  return (
    <div style={{ position: "relative", width: 160, height: 88 }}>
      <PieChart width={160} height={88} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        {/* Thin outer zone ring */}
        <Pie
          data={ZONE_DATA}
          cx={CX}
          cy={CY}
          startAngle={180}
          endAngle={0}
          innerRadius={62}
          outerRadius={67}
          dataKey="value"
          strokeWidth={0}
          isAnimationActive={false}
        />

        {/* Thin fill donut */}
        <Pie
          data={fillData}
          cx={CX}
          cy={CY}
          startAngle={180}
          endAngle={0}
          innerRadius={44}
          outerRadius={58}
          dataKey="value"
          strokeWidth={0}
          isAnimationActive
          animationDuration={700}
          animationEasing="ease-out"
        />
      </PieChart>

      {/* Needle overlaid as a separate SVG so it sits above the donut arcs */}
      <svg
        width={160}
        height={88}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        <line
          x1={CX} y1={CY}
          x2={nx}  y2={ny}
          stroke="#001E2B"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <circle cx={CX} cy={CY} r={4} fill="#001E2B" />
      </svg>
    </div>
  );
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
        <Select
          label="Window"
          aria-label="Time window"
          value={window}
          onChange={(value) => setWindow(value)}
          className={styles.selectWrapper}
        >
          {WINDOWS.map((w) => (
            <Option key={w.value} value={w.value}>
              {w.label}
            </Option>
          ))}
        </Select>
      </div>

      <div className={styles.card}>
        {error ? (
          <Body className={styles.errorText}>Error: {error}</Body>
        ) : !data ? (
          <div className={styles.skeleton} />
        ) : (
          <>
            <div className={styles.gaugeWrapper}>
              <HalfDonutGauge percent={percent} statusKey={statusKey} />
            </div>

            <p className={`${styles.statusLabel} ${styles[`statusLabel_${statusKey}`]}`}>
              {status.label}
            </p>
            <p className={styles.description}>{status.description}</p>

            {/* Live metrics
            <div className={styles.metrics}>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Avg demand now</span>
                <span className={styles.metricValue}>{data.current} W</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Avg demand before</span>
                <span className={styles.metricValue}>{data.previous} W</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Change</span>
                <span className={`${styles.metricValue} ${
                  data.pctChange > 0 ? styles.valueUp :
                  data.pctChange < 0 ? styles.valueDown : ""
                }`}>
                  {data.pctChange > 0 ? "+" : ""}{data.pctChange}%
                  {data.usedFallback && (
                    <span className={styles.fallback}> (limited history)</span>
                  )}
                </span>
              </div>
            </div> */}

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
