"use client";

import Card from "@leafygreen-ui/card";
import { H3, Body, Error as ErrorText } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
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

// Turns a millisecond duration into a short human-readable string (e.g. "2h 30m").
function formatDuration(ms) {
  if (!ms) return "—";
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
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
    <Card style={{ padding: spacing[4], maxWidth: 520 }}>
      <H3 style={{ color: palette.green.dark2, marginBottom: spacing[3] }}>
        Outage Summary
      </H3>

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
    </Card>
  );
}
