"use client";

import { useEffect, useState } from "react";
import { H1, Body } from "@leafygreen-ui/typography";
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

const columns = [
  {
    accessorKey: "timestamp",
    header: "Timestamp",
    cell: ({ getValue }) => {
      const val = getValue();
      return val ? new Date(val).toLocaleString() : "N/A";
    },
  },
  {
    accessorKey: "dataid",
    header: "Meter ID",
  },
  {
    accessorKey: "avg_reading",
    header: "Avg Reading (kW)",
    enableSorting: true,
    cell: ({ getValue }) => {
      const val = getValue();
      return val != null ? val.toFixed(2) : "N/A";
    },
  },
  {
    accessorKey: "volt_leg_1",
    header: "Volt Leg 1 (V)",
    cell: ({ getValue }) => {
      const val = getValue();
      return val != null ? val.toFixed(1) : "N/A";
    },
  },
  {
    accessorKey: "volt_leg_2",
    header: "Volt Leg 2 (V)",
    cell: ({ getValue }) => {
      const val = getValue();
      return val != null ? val.toFixed(1) : "N/A";
    },
  },
];

export default function LiveMeterReading({ meterId }) {
  const [reading, setReading] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchReading = () => {
      fetch(`/api/meters/${meterId}/live`)
        .then((res) => {
          if (!res.ok) throw new Error(`Meter "${meterId}" not found`);
          return res.json();
        })
        .then((data) => setReading(data))
        .catch((err) => setError(err.message));
    };

    fetchReading();
    const intervalId = setInterval(fetchReading, 5000);
    return () => clearInterval(intervalId);
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
