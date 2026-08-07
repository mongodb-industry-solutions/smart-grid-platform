"use client";

import { useEffect, useMemo, useState } from "react";
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
import { useConsumptionTrend } from "./useConsumptionTrend";
import {
  CHART_MARGIN,
  AXIS_TICK,
  X_AXIS_LINE,
  TOOLTIP_CONTENT,
  TOOLTIP_LABEL,
  TOOLTIP_CURSOR,
  LEGEND_WRAPPER,
} from "@/lib/const/chartConfig";
import ShowDocButton from "./ShowDocButton";
import styles from "../../style/customers/customers.module.css";

const ACTUAL_COLOR = "#00684A";
const SEGMENT_COLOR = "#889397";

// Formats an ISO timestamp as a short HH:MM label.
function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Renders each legend entry as a swatch of its actual line style (solid or
// dashed) instead of a plain colored dot, so the line pattern itself is the label.
function renderLineLegend({ payload = [] }) {
  return (
    <ul
      style={{
        display: "flex",
        justifyContent: "center",
        gap: 20,
        margin: 0,
        padding: "12px 0 0",
        listStyle: "none",
        fontSize: 12,
        color: "#3D4F58",
      }}
    >
      {payload.map((entry) => (
        <li
          key={entry.value}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <svg width="24" height="10" aria-hidden="true">
            <line
              x1="0"
              y1="5"
              x2="24"
              y2="5"
              stroke={entry.color}
              strokeWidth="2"
              strokeDasharray={entry.payload?.strokeDasharray}
            />
          </svg>
          {entry.value}
        </li>
      ))}
    </ul>
  );
}

export default function ConsumptionTrend({ dataid }) {
  // null = follow the selected customer's own region.
  const [region, setRegion] = useState(null);
  // The customer's own home region — fixed regardless of which region is
  // picked for comparison, since the "actual" line never changes with it.
  const [homeRegion, setHomeRegion] = useState(null);

  // Reset to the customer's own region whenever the selected customer changes.
  useEffect(() => {
    setRegion(null);
    setHomeRegion(null);
  }, [dataid]);

  const { data, isLoading, error } = useConsumptionTrend(dataid, region);

  // The first response for a customer (region === null) reflects their own
  // region — capture it once so it survives later comparison-region changes.
  useEffect(() => {
    if (region === null && data?.regionLabel) {
      setHomeRegion(data.regionLabel);
    }
  }, [region, data]);

  const chartData = useMemo(
    () =>
      (data?.points ?? []).map((point) => ({
        ...point,
        label: formatTime(point.time),
      })),
    [data]
  );

  const regions = data?.availableRegions ?? [];
  const currentRegion = region ?? data?.regionLabel ?? "";
  const actualRegion = homeRegion ?? currentRegion;

  let body;
  if (dataid == null) {
    body = <Body>Select a customer to see their consumption.</Body>;
  } else if (error) {
    body = <Body>Error: {error}</Body>;
  } else if (isLoading && !data) {
    body = <Body>Loading consumption…</Body>;
  } else if (chartData.length === 0) {
    body = <Body>No consumption data available.</Body>;
  } else {
    body = (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8edeb" vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={X_AXIS_LINE}
          />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={52} />
          <Tooltip
            contentStyle={TOOLTIP_CONTENT}
            labelStyle={TOOLTIP_LABEL}
            cursor={TOOLTIP_CURSOR}
          />
          <Legend content={renderLineLegend} wrapperStyle={LEGEND_WRAPPER} />
          <Line
            type="monotone"
            dataKey="actual"
            name={`${actualRegion} — Actual (kWh)`}
            stroke={ACTUAL_COLOR}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="segment"
            name={`${currentRegion} — Segment Average (kWh)`}
            stroke={SEGMENT_COLOR}
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div>
      {/* Title sits outside the card, matching the monitoring panel pattern. */}
      <div className={styles.chartHeader}>
        <div>
          <H2>Consumption Trend</H2>
          <Body style={{ fontSize: 12, color: "#5C6970", marginTop: 2 }}>
            Actual usage versus the segment average for{" "}
            {currentRegion || "the selected region"}, over time.
          </Body>
        </div>
        <div className={styles.chartHeaderRight}>
          {regions.length > 0 && (
            <Select
              label="Region"
              value={currentRegion}
              onChange={setRegion}
              className={styles.regionSelect}
            >
              {regions.map((r) => (
                <Option key={r} value={r}>
                  {r}
                </Option>
              ))}
            </Select>
          )}
        </div>
      </div>

      <div className={styles.chartCard}>
        <ShowDocButton component="trend" dataid={dataid} />
        <div className={styles.chartBody}>{body}</div>
      </div>
    </div>
  );
}
