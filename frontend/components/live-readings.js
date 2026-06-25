"use client";

import { useEffect, useState } from "react";
import { H2, Body } from "@leafygreen-ui/typography";
import { Select, Option } from "@leafygreen-ui/select";
import styles from "./live-readings.module.css";
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

const TICK_MS = 5_000;
const MAX_ROWS = 25;

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
    accessorKey: "avg_reading",
    header: "Avg Reading",
    cell: ({ getValue }) => {
      const val = getValue();
      return val != null ? val.toFixed(2) : "N/A";
    },
  },
  {
    accessorKey: "volt_leg_1",
    header: "Volt Leg 1",
    cell: ({ getValue }) => {
      const val = getValue();
      return val != null ? val.toFixed(1) : "N/A";
    },
  },
  {
    accessorKey: "volt_leg_2",
    header: "Volt Leg 2",
    cell: ({ getValue }) => {
      const val = getValue();
      return val != null ? val.toFixed(1) : "N/A";
    },
  },
];

export default function RecentReadings() {
  const [readings, setReadings]     = useState([]);
  const [limit, setLimit]           = useState(5);
  const [selectValue, setSelectValue] = useState("5");
  const [customInput, setCustomInput] = useState("");
  const [error, setError]           = useState("");

  useEffect(() => {
    let periodIndex = 0;

    const fetchReadings = async () => {
      try {
        const res = await fetch(
          `/api/monitoring-panel/reading-logs?periodIndex=${periodIndex}&limit=${limit}`
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (data.length) setReadings(data);
        periodIndex += 1;
      } catch (err) {
        setError(err.message);
      }
    };

    fetchReadings();
    const intervalId = setInterval(fetchReadings, TICK_MS);
    return () => clearInterval(intervalId);
  }, [limit]);

  function handleSelectChange(val) {
    setSelectValue(val);
    if (val !== "custom") {
      setCustomInput("");
      setLimit(Number(val));
    }
  }

  function handleCustomApply() {
    const n = parseInt(customInput);
    if (!isNaN(n) && n >= 1 && n <= MAX_ROWS) {
      setLimit(n);
    }
  }

  const table = useLeafyGreenTable({ data: readings, columns });

  if (error) return <Body>Error: {error}</Body>;
  if (!readings.length) return <Body>Loading...</Body>;

  return (
    <div>
      <div className={styles.header}>
        <H2>Recent Readings</H2>

        <div className={styles.controls}>
          <Select
            label="Rows to show"
            value={selectValue}
            onChange={handleSelectChange}
            className={styles.selectWrapper}
          >
            <Option value="5">5</Option>
            <Option value="10">10</Option>
            <Option value="15">15</Option>
            <Option value="20">20</Option>
            <Option value="25">All 25</Option>
            <Option value="custom">Custom…</Option>
          </Select>

          {selectValue === "custom" && (
            <div className={styles.customInputRow}>
              <input
                type="number"
                min={1}
                max={MAX_ROWS}
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCustomApply()}
                placeholder={`1–${MAX_ROWS}`}
                className={styles.customInput}
              />
              <button
                onClick={handleCustomApply}
                className={styles.applyButton}
              >
                Apply
              </button>
            </div>
          )}
        </div>
      </div>

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
  );
}
