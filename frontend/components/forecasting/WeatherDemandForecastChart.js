"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceArea, ReferenceLine, ResponsiveContainer,
} from "recharts";
import Icon from "@leafygreen-ui/icon";
import { AXIS_TICK, TOOLTIP_CONTENT, LEGEND_WRAPPER } from "@/lib/const/chartConfig";
import ShowDocButton from "@/components/customers/ShowDocButton";
import styles from "../../style/forecasting/document-showcase.module.css";

// LeafyGreen palette (matches the other forecasting charts).
const C = {
  demand: "#016bf8",
  temp: "#d97706",
  capacity: "#db3030",
  peakFill: "#FAC775",
  peakLabel: "#854F0B",
  muted: "#89979b",
  strong: "#c1c7c6",
  textPrimary: "#001e2b",
  textSecondary: "#5c6970",
  danger: "#db3030",
  success: "#00684a",
};

// Contiguous hours within ~90% of the max forecasted value (a window, not an
// instant). Runs on the series the API returns.
function findPeakWindow(points, nowIndex) {
  const future = points.filter((p) => p.hour >= nowIndex && p.forecastKwh != null);
  if (future.length === 0) return null;
  const peak = future.reduce((a, b) => (b.forecastKwh > a.forecastKwh ? b : a));
  const threshold = peak.forecastKwh * 0.9;
  const windowPoints = future.filter((p) => p.forecastKwh >= threshold);
  const start = windowPoints[0];
  const end = windowPoints[windowPoints.length - 1];
  return { peak, startLabel: start.label, endLabel: end.label };
}

// Temperature is stored in °F (as fetched from Open-Meteo); convert for display.
const toDisplayTemp = (tempF, unit) =>
  tempF == null ? null : unit === "C" ? Math.round(((tempF - 32) * 5) / 9) : Math.round(tempF);

function CustomTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  const kwh = payload.find((p) => p.dataKey === "historicalKwh" || p.dataKey === "forecastKwh");
  const temp = payload.find((p) => p.dataKey === "tempDisplay");
  return (
    <div style={{ ...TOOLTIP_CONTENT, padding: "8px 12px" }}>
      <div style={{ color: C.textSecondary, marginBottom: 4 }}>{label}</div>
      {kwh && <div style={{ color: C.textPrimary }}>Energy: <strong>{kwh.value?.toLocaleString()} kWh</strong></div>}
      {temp?.value != null && <div style={{ color: C.textSecondary }}>Temp: {temp.value}°{unit}</div>}
    </div>
  );
}

// The region/feeder/meter selection lives in the page panel and drives the
// forecast data (passed in as props). Temperature unit is a local display
// preference, so it stays here as component state.
export default function WeatherDemandForecastChart({
  region,
  points = [],
  nowIndex = 0,
  isLoading,
  isRefreshing,
  error,
}) {
  const [unit, setUnit] = useState("F"); // temperature display unit: "F" | "C"
  const peakInfo = useMemo(() => findPeakWindow(points, nowIndex), [points, nowIndex]);

  // Add a unit-converted temperature field for the chart to plot.
  const chartData = useMemo(
    () => points.map((p) => ({ ...p, tempDisplay: toDisplayTemp(p.tempF, unit) })),
    [points, unit]
  );
  const heatingDisplay = toDisplayTemp(region?.heatingBaseF ?? 65, unit);
  const coolingDisplay = toDisplayTemp(region?.coolingBaseF ?? 72, unit);
  const weekendFactor = region?.weekendFactor ?? 1;
  const weekendPct = Math.round((weekendFactor - 1) * 100);

  const capacityKw = region?.capacityKw ?? null;
  const hasCapacity = typeof capacityKw === "number" && capacityKw > 0;

  // Capacity is a kW rating; over a single hour it equals the max deliverable
  // kWh, so peak hourly energy vs capacityKw is a valid comparison.
  const percentOfCapacity =
    peakInfo && hasCapacity ? Math.round((peakInfo.peak.forecastKwh / capacityKw) * 100) : null;
  const trendVsBaseline =
    peakInfo && peakInfo.peak.baselineKwh
      ? Math.round(((peakInfo.peak.forecastKwh - peakInfo.peak.baselineKwh) / peakInfo.peak.baselineKwh) * 100)
      : null;
  const nearCapacity = percentOfCapacity != null && percentOfCapacity >= 90;

  return (
    <div className={styles.chartCard}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: C.textPrimary }}>Energy usage forecast — weather adjusted</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ShowDocButton scope="forecasting" component="weather" inline />
          {isRefreshing && <span className={styles.updating}>updating…</span>}
          <div style={{ display: "inline-flex", border: `1px solid ${C.strong}`, borderRadius: 8, overflow: "hidden" }}>
            {["F", "C"].map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                style={{
                  fontSize: 13,
                  padding: "6px 10px",
                  border: "none",
                  cursor: "pointer",
                  background: unit === u ? C.demand : "#ffffff",
                  color: unit === u ? "#ffffff" : C.textSecondary,
                  fontWeight: unit === u ? 600 : 400,
                }}
                aria-pressed={unit === u}
              >
                °{u}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div className={styles.errorText} style={{ color: C.danger }}>
          Couldn&apos;t load the forecast: {error}
        </div>
      ) : isLoading ? (
        <div className={styles.errorText} style={{ color: C.textSecondary }}>Loading forecast…</div>
      ) : points.length === 0 ? (
        <div className={styles.errorText} style={{ color: C.textSecondary }}>
          No readings available for this region in the current data window.
        </div>
      ) : (
        <>
          <div className={isRefreshing ? styles.refreshing : undefined} style={{ background: "#f9fbfa", borderRadius: "8px", padding: "1rem" }}>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8edeb" vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} interval={3} />
                <YAxis yAxisId="left" tick={AXIS_TICK} width={50} label={{ value: "kWh", angle: -90, position: "insideLeft", fontSize: 11, fill: C.muted }} />
                <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} width={40} label={{ value: `°${unit}`, angle: 90, position: "insideRight", fontSize: 11, fill: C.muted }} />
                <Tooltip content={<CustomTooltip unit={unit} />} />
                <Legend wrapperStyle={LEGEND_WRAPPER} />

                {peakInfo && (
                  <ReferenceArea
                    yAxisId="left"
                    x1={peakInfo.startLabel}
                    x2={peakInfo.endLabel}
                    fill={C.peakFill}
                    fillOpacity={0.2}
                    label={{ value: "Peak window", position: "insideTop", fontSize: 10, fill: C.peakLabel }}
                  />
                )}

                {hasCapacity && (
                  <ReferenceLine yAxisId="left" y={capacityKw} stroke={C.capacity} strokeDasharray="4 3" label={{ value: "Capacity", position: "insideTopRight", fontSize: 10, fill: C.capacity }} />
                )}
                <ReferenceLine yAxisId="left" x={points[nowIndex]?.label} stroke={C.strong} strokeDasharray="2 3" label={{ value: "Now", position: "top", fontSize: 10, fill: C.muted }} />

                <Line yAxisId="left" type="monotone" dataKey="baselineKwh" name="Typical baseline" stroke={C.muted} strokeDasharray="2 3" dot={false} strokeWidth={1.5} />
                <Line yAxisId="left" type="monotone" dataKey="historicalKwh" name="Actual" stroke={C.demand} dot={false} strokeWidth={2} connectNulls />
                <Line yAxisId="left" type="monotone" dataKey="forecastKwh" name="Forecast" stroke={C.demand} strokeDasharray="5 4" dot={false} strokeWidth={2} connectNulls />
                <Line yAxisId="right" type="monotone" dataKey="tempDisplay" name="Temperature" stroke={C.temp} dot={false} strokeWidth={1.5} opacity={0.8} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {peakInfo && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: "1rem" }}>
              <div style={{ background: "#f9fbfa", borderRadius: "8px", padding: "1rem" }}>
                <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 6 }}>Predicted peak window</div>
                <div style={{ fontSize: 20, fontWeight: 500, color: C.textPrimary }}>{peakInfo.startLabel} — {peakInfo.endLabel}</div>
              </div>
              <div style={{ background: "#f9fbfa", borderRadius: "8px", padding: "1rem" }}>
                <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 6 }}>Peak hourly energy</div>
                <div style={{ fontSize: 20, fontWeight: 500, color: C.textPrimary }}>{peakInfo.peak.forecastKwh.toLocaleString()} kWh</div>
              </div>
              {hasCapacity && (
                <div style={{ background: "#f9fbfa", borderRadius: "8px", padding: "1rem" }}>
                  <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 6 }}>Peak energy vs capacity</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 20, fontWeight: 500, color: nearCapacity ? C.danger : C.textPrimary }}>
                    {peakInfo.peak.forecastKwh.toLocaleString()} / {capacityKw.toLocaleString()} kWh
                    {nearCapacity && <Icon glyph="Warning" fill={C.danger} />}
                  </div>
                  <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 4 }}>
                    {percentOfCapacity}% of capacity
                  </div>
                </div>
              )}
              {trendVsBaseline != null && (
                <div style={{ background: "#f9fbfa", borderRadius: "8px", padding: "1rem" }}>
                  <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 6 }}>vs typical baseline</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 20, fontWeight: 500, color: C.textPrimary }}>
                    <Icon glyph={trendVsBaseline >= 0 ? "ArrowUp" : "ArrowDown"} fill={trendVsBaseline >= 0 ? C.danger : C.success} />
                    {trendVsBaseline >= 0 ? "+" : ""}{trendVsBaseline}%
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 12, color: C.textSecondary }}>
            <Icon glyph="LightningBolt" fill={C.textSecondary} size="small" />
            Degree-day model: each region&apos;s hour-of-day baseline (from its meter readings, adjusted
            for weekday vs. weekend{weekendPct !== 0 ? ` — weekends run ~${Math.abs(weekendPct)}% ${weekendPct > 0 ? "higher" : "lower"}` : ""})
            plus a temperature term fit from history — heating-degree-hours below {heatingDisplay}°{unit} and
            cooling-degree-hours above {coolingDisplay}°{unit}, using Open-Meteo temperature for{" "}
            {region?.city ?? "the region"}. This region is {region?.weatherMode === "cooling" ? "cooling" : "heating"}-dominated.
          </div>
        </>
      )}
    </div>
  );
}
