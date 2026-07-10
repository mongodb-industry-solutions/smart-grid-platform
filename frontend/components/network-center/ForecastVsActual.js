"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { CHART_MARGIN, AXIS_TICK, TOOLTIP_CONTENT, TOOLTIP_LABEL } from "@/lib/const/chartConfig";
import { Panel } from "@/components/network-center/panels";
import styles from "@/style/network-center/network-center.module.css";

const ACTUAL_COLOR = "#00A35C";
const FORECAST_COLOR = "#016BF8";

const fmtTime = (iso) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });

const fmtKw = (v) => (v == null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(1)} MW` : `${Math.round(v)} kW`);

function ForecastTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div style={TOOLTIP_CONTENT}>
      <div style={{ ...TOOLTIP_LABEL, marginBottom: 4 }}>{fmtTime(label)}</div>
      {row.actual != null && (
        <div style={{ color: ACTUAL_COLOR, fontWeight: 600 }}>Actual · {fmtKw(row.actual)}</div>
      )}
      {row.forecast != null && (
        <div style={{ color: FORECAST_COLOR }}>Forecast · {fmtKw(row.forecast)}</div>
      )}
    </div>
  );
}

/**
 * Slim, cohesive "forecast vs actual" line for the control center: sums the
 * scoped substations' demand into a single actual (solid) + forecast (dashed)
 * kW series, split at the last real reading. Reuses useRegionalForecast's data
 * (fetched by the page) — a dedicated component so it carries none of the
 * forecasting page's header/legend/pipeline chrome.
 */
export default function ForecastVsActual({ regions, isLoading, isRefreshing, error }) {
  const { data, splitAt } = useMemo(() => {
    if (!regions?.length) return { data: [], splitAt: null };

    // Sum actual/forecast kW across all in-scope regions, per timestamp.
    const byT = new Map();
    for (const r of regions) {
      for (const p of r.series ?? []) {
        const row = byT.get(p.t) || { t: p.t, actual: null, forecast: null };
        if (p.actual != null) row.actual = (row.actual ?? 0) + p.actual;
        if (p.forecast != null) row.forecast = (row.forecast ?? 0) + p.forecast;
        byT.set(p.t, row);
      }
    }
    const rows = [...byT.values()].sort((a, b) => (a.t < b.t ? -1 : 1));
    const lastActual = [...rows].reverse().find((r) => r.actual != null);
    return { data: rows, splitAt: lastActual?.t ?? null };
  }, [regions]);

  let body;
  if (error) {
    body = <div className={styles.empty}>Error: {error}</div>;
  } else if (isLoading && data.length === 0) {
    body = <div className={styles.empty}>Loading forecast…</div>;
  } else if (data.length === 0) {
    body = <div className={styles.empty}>No forecast data for this scope.</div>;
  } else {
    body = (
      <div style={{ opacity: isRefreshing ? 0.7 : 1 }}>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8edeb" />
            <XAxis
              dataKey="t"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: "#e8edeb" }}
              tickFormatter={fmtTime}
              minTickGap={56}
            />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}MW` : `${v}`)}
            />
            <Tooltip content={<ForecastTooltip />} />
            {splitAt && (
              <ReferenceLine
                x={splitAt}
                stroke="#c1c7c6"
                strokeDasharray="4 4"
                label={{ value: "now", position: "top", fill: "#889397", fontSize: 11 }}
              />
            )}
            <Line
              type="monotone"
              dataKey="actual"
              name="Actual"
              stroke={ACTUAL_COLOR}
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="forecast"
              name="Forecast"
              stroke={FORECAST_COLOR}
              strokeWidth={2.5}
              strokeDasharray="6 5"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#5C6970", paddingTop: 4 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 14, height: 2, background: ACTUAL_COLOR, display: "inline-block" }} /> Actual
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 14, height: 0, borderTop: `2px dashed ${FORECAST_COLOR}`, display: "inline-block" }} /> Forecast
          </span>
        </div>
      </div>
    );
  }

  return <Panel title="Forecast vs Actual">{body}</Panel>;
}
