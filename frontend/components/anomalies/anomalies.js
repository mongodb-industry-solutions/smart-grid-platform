"use client";

import { useState } from "react";
import { H2, Body, Error as ErrorText } from "@leafygreen-ui/typography";
import { Select, Option } from "@leafygreen-ui/select";
import Badge from "@leafygreen-ui/badge";
import {
  Table,
  TableHead,
  TableBody,
  HeaderRow,
  HeaderCell,
  Row,
  Cell,
  useLeafyGreenTable,
  flexRender,
} from "@leafygreen-ui/table";
import { useAnomalies } from "./useAnomalies";
import styles from "../../style/anomalies/anomalies.module.css";

const THRESHOLDS = ["3", "2.5", "2", "1.5"];

const METRIC_LABELS = {
  voltage: "Voltage",
  current: "Current",
  power: "Power",
  power_factor: "Power Factor",
  frequency: "Frequency",
};

// Formats a number to a fixed number of decimals, with a fallback for nulls.
function fmt(value, decimals) {
  return value != null ? value.toFixed(decimals) : "N/A";
}

const columns = [
  { accessorKey: "meterId", header: "Meter" },
  {
    accessorKey: "metric",
    header: "Metric",
    cell: ({ getValue }) => METRIC_LABELS[getValue()] ?? getValue(),
  },
  {
    accessorKey: "value",
    header: "Reading",
    cell: ({ getValue }) => fmt(getValue(), 2),
  },
  {
    accessorKey: "mean",
    header: "Baseline avg",
    cell: ({ getValue }) => fmt(getValue(), 2),
  },
  {
    accessorKey: "std",
    header: "Std dev",
    cell: ({ getValue }) => fmt(getValue(), 3),
  },
  {
    accessorKey: "sigma",
    header: "Deviation (σ)",
    cell: ({ getValue }) => {
      const sigma = getValue();
      const variant = sigma >= 3 ? "red" : "yellow";
      return <Badge variant={variant}>{fmt(sigma, 2)}σ</Badge>;
    },
  },
  {
    accessorKey: "timestamp",
    header: "Timestamp",
    cell: ({ getValue }) => {
      const val = getValue();
      return val ? new Date(val).toLocaleString() : "N/A";
    },
  },
];

export default function Anomalies() {
  const [threshold, setThreshold] = useState(3);
  const { anomalies, isLoading, error } = useAnomalies(threshold);

  const table = useLeafyGreenTable({ data: anomalies, columns });

  const handleThresholdChange = (val) => {
    setThreshold(Number(val));
  };

  return (
    <div>
      <div className={styles.header}>
        <H2>Anomalies</H2>

        <div className={styles.controls}>
          <Select
            label="Threshold"
            value={String(threshold)}
            onChange={handleThresholdChange}
            className={styles.selectWrapper}
          >
            {THRESHOLDS.map((t) => (
              <Option key={t} value={t}>
                {t}σ
              </Option>
            ))}
          </Select>
        </div>
      </div>

      {error && <ErrorText>Error: {error}</ErrorText>}

      {!error && isLoading && (
        <div className={styles.emptyState}>
          <Body>Loading anomalies…</Body>
        </div>
      )}

      {!error && !isLoading && anomalies.length === 0 && (
        <div className={styles.emptyState}>
          <Body>No anomalies above {threshold}σ.</Body>
        </div>
      )}

      {!error && !isLoading && anomalies.length > 0 && (
        <div className={styles.tableWrapper}>
          <Table table={table}>
            <TableHead isSticky>
              {table.getHeaderGroups().map((headerGroup) => (
                <HeaderRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <HeaderCell key={header.id} header={header}>
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                    </HeaderCell>
                  ))}
                </HeaderRow>
              ))}
            </TableHead>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <Row key={row.id} row={row}>
                  {row.getVisibleCells().map((cell) => (
                    <Cell key={cell.id} cell={cell}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </Cell>
                  ))}
                </Row>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
