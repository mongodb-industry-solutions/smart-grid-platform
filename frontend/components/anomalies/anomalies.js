"use client";

import ShowDocButton from "@/components/customers/ShowDocButton";

import { H2, Body, Error as ErrorText } from "@leafygreen-ui/typography";
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
import TablePagination from "@/components/general/TablePagination";
import { useAutoPageSize } from "@/components/general/useAutoPageSize";
import styles from "../../style/anomalies/anomalies.module.css";

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
    accessorKey: "sigma",
    header: "Deviation (σ)",
    cell: ({ getValue }) => (
      <span className={styles.chip}>{fmt(getValue(), 2)}σ</span>
    ),
  },
];

// The snapshot time = the most recent reading time among the anomalies (each
// anomaly is a meter's latest reading). Shown once in the header.
function getSnapshotTime(anomalies) {
  if (!anomalies.length) return null;
  const latest = Math.max(
    ...anomalies.map((a) => new Date(a.timestamp).getTime())
  );
  return new Date(latest).toLocaleString();
}

export default function Anomalies() {
  // Show every meter's deviation, regardless of how large σ is.
  const threshold = 0;
  const { anomalies, isLoading, error } = useAnomalies(threshold);

  const table = useLeafyGreenTable({
    data: anomalies,
    columns,
    withPagination: true,
    autoResetPageIndex: false,
    initialState: { pagination: { pageSize: 5 } },
  });

  const wrapperRef = useAutoPageSize(table);

  const snapshotTime = getSnapshotTime(anomalies);

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <div>
          <H2>Anomalies</H2>
        </div>

        <div className={styles.controls}>
          <ShowDocButton scope="monitoring" component="anomalies" inline />
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
          <Body>No readings to display.</Body>
        </div>
      )}

      {!error && !isLoading && anomalies.length > 0 && (
        <div className={styles.tableWrapper}>
          <div className={styles.tableScroll} ref={wrapperRef}>
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

          <div className={styles.paginationBar}>
            <TablePagination table={table} />
          </div>
        </div>
      )}
    </div>
  );
}
