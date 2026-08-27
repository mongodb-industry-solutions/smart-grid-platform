"use client";

import { useEffect, useState } from "react";
import { H1, Body } from "@leafygreen-ui/typography";
import { useStream } from "@/lib/streaming/useStream";
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

const fmt = (val, decimals) => (val != null ? val.toFixed(decimals) : "N/A");

const columns = [
  {
    accessorKey: "dataid",
    header: "Meter ID",
  },
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

export default function LiveMeterReading({ meterId }) {
  const { readings: streamReadings, status } = useStream();
  const [reading, setReading] = useState(null);
  const [error, setError] = useState("");

  // Filter the SSE stream for this specific meter.
  useEffect(() => {
    const match = streamReadings.find((r) => r.dataid === meterId);
    if (match) setReading(match);
  }, [streamReadings, meterId]);

  // Initial fetch for the first render (before the stream delivers data).
  useEffect(() => {
    fetch(`/api/meters/${meterId}/live`)
      .then((res) => {
        if (!res.ok) throw new Error(`Meter "${meterId}" not found`);
        return res.json();
      })
      .then((data) => setReading(data))
      .catch((err) => setError(err.message));
  }, [meterId]);

  const table = useLeafyGreenTable({
    data: reading ? [reading] : [],
    columns,
  });

  if (error) return <Body>Error: {error}</Body>;
  if (!reading) return <Body>Loading meter {meterId}...</Body>;

  return (
    <div>
      <H1>Smart Meter {meterId}</H1>
      <Table table={table}>
        <TableHead>
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
  );
}
