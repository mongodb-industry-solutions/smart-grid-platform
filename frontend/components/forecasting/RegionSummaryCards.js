"use client";

import { Body } from "@leafygreen-ui/typography";
import styles from "../../style/forecasting/document-showcase.module.css";

const SEVERITY = {
  normal: { label: "Normal", color: "#00684A" },
  elevated: { label: "Elevated", color: "#B45309" },
  critical: { label: "Critical", color: "#DB3030" },
};

const fmtTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-US", {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "UTC",
      })
    : "—";

const fmt = (n, d = 1) =>
  n == null ? "—" : Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

function TrendPill({ trend }) {
  if (!trend) return <span className={styles.summaryTrendFlat}>no prior period</span>;
  const { direction, deltaPct } = trend;
  if (direction === "flat")
    return <span className={styles.summaryTrendFlat}>▬ flat vs prior</span>;
  const up = direction === "up";
  return (
    <span className={up ? styles.summaryTrendUp : styles.summaryTrendDown}>
      {up ? "▲" : "▼"} {fmt(Math.abs(deltaPct))}% vs prior
    </span>
  );
}

/**
 * One card per compared region: predicted peak, when it hits, its % of the
 * region's capacity (color-coded by severity), and the trend vs the prior period.
 */
export default function RegionSummaryCards({ regions }) {
  if (!regions?.length) return null;

  return (
    <div className={styles.summaryGrid}>
      {regions.map((r) => {
        const sev = r.peak?.severity ? SEVERITY[r.peak.severity] : null;
        return (
          <div key={r.regionId} className={styles.summaryCard}>
            <div className={styles.summaryHeader}>
              <span className={styles.summaryTitle}>{r.label}</span>
              {sev && (
                <span
                  className={styles.summaryBadge}
                  style={{ color: sev.color, borderColor: sev.color }}
                >
                  {sev.label}
                </span>
              )}
            </div>

            <div className={styles.summaryPctRow}>
              <span
                className={styles.summaryPct}
                style={{ color: sev?.color ?? "#001e2b" }}
              >
                {r.hasCapacity ? `${fmt(r.peak?.pctCapacity)}%` : "—"}
              </span>
              <span className={styles.summaryPctLabel}>of capacity at peak</span>
            </div>

            <div className={styles.summaryMetrics}>
              <div className={styles.summaryMetric}>
                <span className={styles.summaryMetricLabel}>Peak demand</span>
                <span className={styles.summaryMetricValue}>{fmt(r.peak?.value)} kW</span>
              </div>
              <div className={styles.summaryMetric}>
                <span className={styles.summaryMetricLabel}>Peak time</span>
                <span className={styles.summaryMetricValue}>{fmtTime(r.peak?.t)}</span>
              </div>
              <div className={styles.summaryMetric}>
                <span className={styles.summaryMetricLabel}>Capacity</span>
                <span className={styles.summaryMetricValue}>
                  {r.hasCapacity ? `${fmt(r.capacity_kw, 0)} kW` : "—"}
                </span>
              </div>
              <div className={styles.summaryMetric}>
                <span className={styles.summaryMetricLabel}>Trend</span>
                <span className={styles.summaryMetricValue}>
                  <TrendPill trend={r.trend} />
                </span>
              </div>
            </div>

            {!r.hasCapacity && (
              <Body className={styles.summaryNote}>No capacity data for this region.</Body>
            )}
          </div>
        );
      })}
    </div>
  );
}
