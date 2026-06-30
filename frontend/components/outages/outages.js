"use client";

import { H2, Body, Error as ErrorText } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import { useOutages } from "./useOutages";
import styles from "../../style/outages/panel.module.css";

// Turns a millisecond duration into a short human-readable string (e.g. "2h 30m").
function formatDuration(ms) {
  if (!ms) return "—";
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes} minutes`;
}

// Builds the rows shown in the summary table from the API summary object.
function buildRows(summary) {
  const { longestOutage } = summary;

  return [
    {
      label: "Total outages",
      value: summary.totalOutages.toLocaleString(),
    },
    {
      label: "Customers with an outage",
      value: `${summary.pctCustomersWithOutage.toFixed(1)}%`,
    },
    {
      label: "Longest outage",
      value:
        longestOutage && longestOutage.meterId !== null
          ? formatDuration(longestOutage.durationMs)
          : "—",
    },
  ];
}

export default function Outages() {
  const { summary, isLoading, error } = useOutages();

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <H2>Outage Summary</H2>
      </div>

      <div className={`${styles.card} ${styles.cardCentered}`}>
        {isLoading && (
          <Body style={{ color: palette.gray.dark1 }}>Loading outages…</Body>
        )}

        {error && <ErrorText>Error: {error}</ErrorText>}

        {!isLoading && !error && !summary && (
          <Body style={{ color: palette.gray.dark1 }}>
            No outage data available.
          </Body>
        )}

        {!isLoading && !error && summary && (
          <div className={styles.statList}>
            {buildRows(summary).map((row) => (
              <div className={styles.statRow} key={row.label}>
                <span className={styles.statLabel}>{row.label}</span>
                <span className={styles.statValue}>{row.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
