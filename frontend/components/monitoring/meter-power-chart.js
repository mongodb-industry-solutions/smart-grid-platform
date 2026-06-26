"use client";

import { useEffect, useState } from "react";
import { H2, Body } from "@leafygreen-ui/typography";
import { Select, Option } from "@leafygreen-ui/select";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import styles from "../../style/monitoring/live-readings-chart.module.css";
import {
  CHART_MARGIN,
  AXIS_TICK,
  X_AXIS_LINE,
  TOOLTIP_CONTENT,
  TOOLTIP_LABEL,
  TOOLTIP_CURSOR,
  LEGEND_WRAPPER,
} from "../../style/monitoring/chart-styles";

const TICK_MS = 5_000;
const MAX_ROWS = 25;
const MAX_HISTORY = 20;

const PALETTE = [
  "#00684A",
  "#016BF8",
  "#9D6CCF",
  "#DB3030",
  "#FFC010",
  "#00A35C",
  "#1254B7",
  "#F97216",
  "#00BEF4",
  "#B45AF2",
];

const colorFor = (index) => PALETTE[index % PALETTE.length];

export default function MeterPowerChart() {
  const [history, setHistory]           = useState([]);
  const [meterIds, setMeterIds]         = useState([]);
  const [limit, setLimit]               = useState(5);
  const [selectValue, setSelectValue]   = useState("5");
  const [customInput, setCustomInput]   = useState("");
  const [error, setError]               = useState("");

  useEffect(() => {
    let periodIndex = 0;
    setHistory([]);
    setMeterIds([]);

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

        if (data.length) {
          const point = {
            time: new Date(data[0].timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
          };

          const seenIds = [];
          for (const r of data) {
            point[r.dataid] = r.energy ?? 0;
            seenIds.push(r.dataid);
          }

          setMeterIds((prev) => {
            const merged = [...new Set([...prev, ...seenIds])];
            return merged;
          });

          setHistory((prev) => {
            const next = [...prev, point];
            return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
          });

          periodIndex += 1;
        }
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

  if (error) return <Body>Error: {error}</Body>;

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <H2>Power per Meter</H2>
          <span className={styles.liveBadge}>
            <span className={styles.liveDot} />
            LIVE
          </span>
        </div>

        <div className={styles.controls}>
          <Select
            label="Meters to show"
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
              <button onClick={handleCustomApply} className={styles.applyButton}>
                Apply
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={styles.chartWrapper}>
        {!history.length ? (
          <div className={styles.loadingRow}>
            <Body>Loading data…</Body>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart
              data={history}
              margin={CHART_MARGIN}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e8edeb" vertical={false} />
              <XAxis
                dataKey="time"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={X_AXIS_LINE}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip
                contentStyle={TOOLTIP_CONTENT}
                labelStyle={TOOLTIP_LABEL}
                cursor={TOOLTIP_CURSOR}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={LEGEND_WRAPPER}
                formatter={(value) => `Meter ${value}`}
              />
              {meterIds.map((id, index) => (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={id}
                  name={id}
                  stroke={colorFor(index)}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
