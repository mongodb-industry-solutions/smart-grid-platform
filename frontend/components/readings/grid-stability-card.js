"use client";

import ShowDocButton from "@/components/customers/ShowDocButton";

import { useEffect, useState } from "react";
import { PieChart, Pie } from "recharts";
import { H2, Body } from "@leafygreen-ui/typography";
import styles from "../../style/readings/grid-stability-card.module.css";

const TICK_MS = 5_000;

// Industry-standard feeder utilization thresholds
const THRESHOLD_ELEVATED = 70;   // %
const THRESHOLD_CRITICAL = 90;   // %

const STATUS = {
  normal:   { label: "Normal",   description: "All feeders within safe capacity",        color: "#00684A" },
  elevated: { label: "Elevated", description: "Peak feeder nearing capacity — monitor",  color: "#D4730A" },
  critical: { label: "Critical", description: "Feeder over 90 % capacity — grid stress", color: "#DB3030" },
};

// Zone ring arcs are proportional to the real thresholds (0–70 / 70–90 / 90–100)
const ZONE_DATA = [
  { value: 0.70, fill: "#00684A" },
  { value: 0.20, fill: "#D4730A" },
  { value: 0.10, fill: "#DB3030" },
];

function deriveStatus(pct) {
  if (pct >= THRESHOLD_CRITICAL) return "critical";
  if (pct >= THRESHOLD_ELEVATED) return "elevated";
  return "normal";
}

const CX = 80, CY = 82;

function HalfDonutGauge({ percent, statusKey }) {
  const fillData = [
    { value: percent,     fill: STATUS[statusKey].color },
    { value: 1 - percent, fill: "#e8edeb" },
  ];

  const angle = Math.PI * (1 - percent);
  const nx = CX + 46 * Math.cos(angle);
  const ny = CY - 46 * Math.sin(angle);

  return (
    <div style={{ position: "relative", width: 160, height: 88 }}>
      <PieChart width={160} height={88} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <Pie
          data={ZONE_DATA}
          cx={CX} cy={CY}
          startAngle={180} endAngle={0}
          innerRadius={62} outerRadius={67}
          dataKey="value"
          strokeWidth={0}
          isAnimationActive={false}
        />
        <Pie
          data={fillData}
          cx={CX} cy={CY}
          startAngle={180} endAngle={0}
          innerRadius={44} outerRadius={58}
          dataKey="value"
          strokeWidth={0}
          isAnimationActive
          animationDuration={700}
          animationEasing="ease-out"
        />
      </PieChart>
      <svg
        width={160} height={88}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="#001E2B" strokeWidth={1.5} strokeLinecap="round" />
        <circle cx={CX} cy={CY} r={4} fill="#001E2B" />
      </svg>
    </div>
  );
}

function fmt(n, decimals = 1) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function GridStabilityCard() {
  const [data,  setData]  = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let periodIndex = 0;

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/monitoring-panel/grid-stability?periodIndex=${periodIndex}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const json = await res.json();
        if (json.summary) setData(json);
        periodIndex += 1;
        setError("");
      } catch (err) {
        setError(err.message);
      }
    };

    fetchData();
    const id = setInterval(fetchData, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const s = data?.summary ?? null;
  const statusKey = s ? deriveStatus(s.peak_utilization ?? 0) : "normal";
  const status    = STATUS[statusKey];
  const percent   = s ? Math.min((s.peak_utilization ?? 0) / 100, 1) : 0;

  return (
    <div className={styles.widget}>
      <div className={styles.cardHeader}>
        <H2>Grid Stability</H2>
      </div>

      <div className={styles.card}>
        <ShowDocButton scope="monitoring" component="grid-stability" />
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

            <div className={styles.metrics}>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Peak feeder</span>
                <span className={styles.metricValue}>
                  {s.peak_feeder_id ?? "—"}
                  {s.peak_utilization !== null && (
                    <span className={styles.metricSub}> {fmt(s.peak_utilization)}%</span>
                  )}
                </span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Grid load</span>
                <span className={styles.metricValue}>
                  {fmt(s.total_load, 1)} / {fmt(s.total_capacity, 0)} kW
                </span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Overall utilization</span>
                <span className={styles.metricValue}>{fmt(s.overall_utilization)}%</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Feeders</span>
                <span className={styles.metricValue}>
                  <span className={styles.dot_normal}>{s.feeders_normal} normal</span>
                  {" · "}
                  <span className={styles.dot_elevated}>{s.feeders_elevated} elevated</span>
                  {" · "}
                  <span className={styles.dot_critical}>{s.feeders_critical} critical</span>
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
