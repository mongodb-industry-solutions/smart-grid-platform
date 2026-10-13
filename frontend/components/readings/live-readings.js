"use client";

import { useEffect, useState } from "react";
import { H2, Body } from "@leafygreen-ui/typography";
import styles from "../../style/readings/live-readings.module.css";
import {Table,TableHead, TableBody, HeaderRow, HeaderCell, Row, Cell, useLeafyGreenTable, flexRender,} from "@leafygreen-ui/table";
import TablePagination from "@/components/general/TablePagination";
import { useAutoPageSize } from "@/components/general/useAutoPageSize";
import { useStream } from "@/lib/streaming/useStream";

const fmt = (val, decimals) => (val != null ? val.toFixed(decimals) : "N/A");

const columns = [
  { accessorKey: "dataid", header: "Data ID" },
  {
    accessorKey: "timestamp",
    header: "Timestamp",
    cell: ({ getValue }) => {
      const val = getValue();
      return val ? new Date(val).toLocaleString() : "N/A";
    },
  },
  {
    accessorKey: "voltage",
    header: "Voltage (V)",
    cell: ({ getValue }) => fmt(getValue(), 1),
  },
  {
    accessorKey: "volt_leg_1",
    header: "Leg 1 (V)",
    cell: ({ getValue }) => fmt(getValue(), 1),
  },
  {
    accessorKey: "volt_leg_2",
    header: "Leg 2 (V)",
    cell: ({ getValue }) => fmt(getValue(), 1),
  },
  {
    accessorKey: "current",
    header: "Current (A)",
    cell: ({ getValue }) => fmt(getValue(), 2),
  },
  {
    accessorKey: "power",
    header: "Power (W)",
    cell: ({ getValue }) => fmt(getValue(), 1),
  },
  {
    accessorKey: "energy",
    header: "Energy (kWh)",
    cell: ({ getValue }) => fmt(getValue(), 3),
  },
  {
    accessorKey: "power_factor",
    header: "Power Factor",
    cell: ({ getValue }) => fmt(getValue(), 3),
  },
  {
    accessorKey: "frequency",
    header: "Frequency (Hz)",
    cell: ({ getValue }) => fmt(getValue(), 2),
  },
];

export default function RecentReadings() {
  const { readings: streamReadings, lastEventAt } = useStream();
  const [error] = useState("");
  const [seedLatest, setSeedLatest] = useState(null);

  // When the feeder is off the stream is silent — seed the table with the
  // last-known reading per meter so it isn't stuck on "Loading...".
  useEffect(() => {
    let cancelled = false;
    fetch("/api/readings/live-seed")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.latest)) setSeedLatest(data.latest);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Live batch once the stream delivers; otherwise fall back to seed data.
  const readings = streamReadings.length ? streamReadings : seedLatest ?? [];
  const isLive = lastEventAt != null;

  const table = useLeafyGreenTable({
    data: readings,
    columns,
    withPagination: true,
    autoResetPageIndex: false,
    initialState: { pagination: { pageSize: 5 } },
  });

  const wrapperRef = useAutoPageSize(table);

  if (error) return <Body>Error: {error}</Body>;
  if (!readings.length)
    return (
      <Body>
        No readings yet. Start the feeder simulation (toggle, top right) to
        stream meter readings.
      </Body>
    );

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <H2>Recent Readings</H2>
        {!isLive && (
          <Body style={{ fontSize: 12, color: "#5C6970" }}>
            Last known values — start the feeder (top right) for live updates.
          </Body>
        )}
      </div>

      <div className={styles.tableWrapper}>
        <div className={styles.tableScroll} ref={wrapperRef}>
          <Table table={table}>
            <TableHead isSticky>
              {table.getHeaderGroups().map((headerGroup) => (
                <HeaderRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <HeaderCell key={header.id} header={header}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
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
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
    </div>
  );
}
