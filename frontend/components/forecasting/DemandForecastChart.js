"use client";

import { H2, Body } from "@leafygreen-ui/typography";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  ErrorBar,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  CHART_MARGIN,
  AXIS_TICK,
  TOOLTIP_CONTENT,
  TOOLTIP_LABEL,
} from "@/lib/const/chartConfig";
import styles from "../../style/forecasting/document-showcase.module.css";

// Stable colors for the known regions, with a fallback palette for any others.
const REGION_COLORS = {
  Texas: "#016bf8",
  Tennessee: "#00a35c",
  Colorado: "#b45af2",
  Missouri: "#d97706",
  "New Mexico": "#db3030",
  Arizona: "#0498ec",
};
const FALLBACK = ["#016bf8", "#00a35c", "#b45af2", "#d97706", "#db3030", "#0498ec"];

function colorFor(region, index) {
  return REGION_COLORS[region] ?? FALLBACK[index % FALLBACK.length];
}

const fmtHour = (h) => `${String(h).padStart(2, "0")}:00`;

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div style={TOOLTIP_CONTENT}>
      <div style={{ ...TOOLTIP_LABEL, marginBottom: 4 }}>{b.region}</div>
      <div>Expected peak: {b.peak} kW</div>
      <div>95% interval: {b.lower}–{b.upper} kW</div>
      <div>All-day average: {b.average} kW</div>
      <div style={{ color: "#889397" }}>Peak hour: {fmtHour(b.peakHour)}</div>
    </div>
  );
}

export default function DemandForecastChart({
  bars,
  isLoading,
  isRefreshing,
  error,
}) {
  let body;
  if (error) {
    body = <Body>Error: {error}</Body>;
  } else if (isLoading) {
    body = <Body>Loading demand…</Body>;
  } else if (!bars || bars.length === 0) {
    body = <Body>No demand data for the selected filters.</Body>;
  } else {
    const height = Math.max(200, bars.length * 54 + 40);
    body = (
      <div className={isRefreshing ? styles.refreshing : undefined}>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={bars}
            layout="vertical"
            margin={{ ...CHART_MARGIN, right: 64 }}
            barCategoryGap="28%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e8edeb" horizontal={false} />
            <XAxis
              type="number"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: "#e8edeb" }}
              domain={[0, "auto"]}
              label={{
                value: "Expected peak demand (kW)",
                position: "insideBottom",
                offset: -4,
                style: { fill: "#5c6970", fontSize: 12 },
              }}
            />
            <YAxis
              type="category"
              dataKey="region"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={92}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f3f2" }} />
            <Bar dataKey="peak" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {bars.map((b, i) => (
                <Cell key={b.region} fill={colorFor(b.region, i)} />
              ))}
              {/* 95% prediction interval as error bars. */}
              <ErrorBar
                dataKey="margin"
                direction="x"
                width={5}
                stroke="#001e2b"
                strokeOpacity={0.55}
                strokeWidth={1.5}
              />
              <LabelList
                dataKey="peak"
                position="right"
                offset={10}
                formatter={(v) => `${v} kW`}
                style={{ fill: "#001e2b", fontSize: 12, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className={styles.chartCol}>
      <div className={styles.chartHeader}>
        <H2>Expected Demand Peaks by Region</H2>
        {isRefreshing && bars?.length > 0 && (
          <span className={styles.updating}>updating…</span>
        )}
      </div>
      <div className={styles.chartCard}>{body}</div>
      <p className={styles.peakNote}>
        Each bar is a region&apos;s expected peak demand (highest hourly average)
        with a 95% prediction interval (Student-t on the hour&apos;s spread).
        Computed from the historical dataset with MongoDB&apos;s $avg / $stdDevSamp.
      </p>
    </div>
  );
}
