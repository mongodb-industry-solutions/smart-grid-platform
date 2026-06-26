"use client";

import { H2, Body, Error as ErrorText } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import {
  Table,
  TableBody,
  TableHead,
  HeaderRow,
  HeaderCell,
  Row,
  Cell,
} from "@leafygreen-ui/table";
import { useOutages } from "./useOutages";
import styles from "../../style/monitoring/panel.module.css";

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

      <div className={styles.card}>
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
          <Table>
            <TableHead>
              <HeaderRow>
                <HeaderCell>Metric</HeaderCell>
                <HeaderCell>Value</HeaderCell>
              </HeaderRow>
            </TableHead>
            <TableBody>
              {buildRows(summary).map((row) => (
                <Row key={row.label}>
                  <Cell>
                    <Body weight="medium">{row.label}</Body>
                  </Cell>
                  <Cell>
                    <Body>{row.value}</Body>
                  </Cell>
                </Row>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
