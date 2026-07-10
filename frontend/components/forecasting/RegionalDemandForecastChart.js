"use client";

import { useMemo } from "react";
import { H2, Body } from "@leafygreen-ui/typography";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
} from "recharts";
import { CHART_MARGIN, AXIS_TICK, TOOLTIP_CONTENT, TOOLTIP_LABEL } from "@/lib/const/chartConfig";
import ShowDocButton from "@/components/customers/ShowDocButton";
import styles from "../../style/forecasting/document-showcase.module.css";

const PALETTE = ["#016bf8", "#00a35c", "#b45af2", "#d97706", "#db3030", "#0498ec"];
const colorFor = (i) => PALETTE[i % PALETTE.length];

// Time axis labels in UTC (the forecast clock), compact.
const fmtTime = (iso) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });

function ChartTooltip({ active, payload, label, meta }) {
  if (!active || !payload?.length) return null;
  // Group the two series (actual/forecast) back per region.
  const seen = new Map();
  for (const p of payload) {
    if (p.value == null) continue;
    const [regionId, kind] = p.dataKey.split("__");
    if (!seen.has(regionId)) seen.set(regionId, {});
    seen.get(regionId)[kind] = p.value;
  }
  if (seen.size === 0) return null;

  return (
    <div style={TOOLTIP_CONTENT}>
      <div style={{ ...TOOLTIP_LABEL, marginBottom: 6 }}>{fmtTime(label)}</div>
      {[...seen.entries()].map(([regionId, kinds]) => {
        const m = meta.get(regionId);
        const pct = kinds.f ?? kinds.a;
        const kw = m?.capacity_kw ? (pct / 100) * m.capacity_kw : null;
        return (
          <div key={regionId} style={{ marginBottom: 2 }}>
            <span style={{ color: m?.color, fontWeight: 600 }}>{m?.label ?? regionId}</span>
            {"  "}
            {pct != null ? `${pct.toFixed(1)}% of capacity` : "—"}
            {kw != null && (
              <span style={{ color: "#889397" }}> · {kw.toFixed(1)} kW</span>
            )}
            {kinds.a == null && kinds.f != null && (
              <span style={{ color: "#889397" }}> · forecast</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function RegionalDemandForecastChart({
  regions,
  isLoading,
  isRefreshing,
  error,
}) {
  const meta = useMemo(() => {
    const m = new Map();
    (regions ?? []).forEach((r, i) =>
      m.set(r.regionId, { label: r.label, color: colorFor(i), capacity_kw: r.capacity_kw })
    );
    return m;
  }, [regions]);

  const data = useMemo(() => {
    if (!regions?.length) return [];
    const tset = new Set();
    const maps = regions.map((r) => {
      const byT = new Map();
      for (const p of r.series ?? []) {
        byT.set(p.t, p);
        tset.add(p.t);
      }
      return { r, byT };
    });
    return [...tset]
      .sort()
      .map((t) => {
        const row = { t };
        for (const { r, byT } of maps) {
          const cap = r.capacity_kw;
          const p = byT.get(t);
          const toPct = (v) => (cap > 0 && v != null ? (v / cap) * 100 : null);
          row[`${r.regionId}__a`] = p ? toPct(p.actual) : null;
          row[`${r.regionId}__f`] = p ? toPct(p.forecast) : null;
        }
        return row;
      });
  }, [regions]);

  let body;
  if (error) {
    body = <Body>Error: {error}</Body>;
  } else if (isLoading) {
    body = <Body>Loading forecast…</Body>;
  } else if (!regions || regions.length === 0) {
    body = <Body>Select two or more regions to compare projected demand.</Body>;
  } else {
    body = (
      <div className={isRefreshing ? styles.refreshing : undefined}>
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={data} margin={{ ...CHART_MARGIN, right: 28 }}>
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
              domain={[0, (max) => Math.max(105, Math.ceil(max * 1.15))]}
              tickFormatter={(v) => `${v}%`}
              label={{
                value: "% of capacity",
                angle: -90,
                position: "insideLeft",
                style: { fill: "#5c6970", fontSize: 12 },
              }}
            />
            <Tooltip content={<ChartTooltip meta={meta} />} />

            {/* Capacity threshold — each region normalized to its own capacity. */}
            <ReferenceLine
              y={100}
              stroke="#db3030"
              strokeDasharray="6 4"
              label={{ value: "Capacity (100%)", position: "right", fill: "#db3030", fontSize: 11 }}
            />

            {regions.map((r, i) => {
              const color = colorFor(i);
              return [
                <Line
                  key={`${r.regionId}-a`}
                  type="monotone"
                  dataKey={`${r.regionId}__a`}
                  name={r.label}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />,
                <Line
                  key={`${r.regionId}-f`}
                  type="monotone"
                  dataKey={`${r.regionId}__f`}
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />,
              ];
            })}

            {/* Predicted peak markers. */}
            {regions.map((r, i) =>
              r.peak && r.hasCapacity ? (
                <ReferenceDot
                  key={`${r.regionId}-peak`}
                  x={r.peak.t}
                  y={r.peak.pctCapacity}
                  r={5}
                  fill={colorFor(i)}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  isFront
                />
              ) : null
            )}
          </ComposedChart>
        </ResponsiveContainer>

        <div className={styles.legend}>
          {regions.map((r, i) => (
            <span key={r.regionId} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: colorFor(i) }} />
              {r.label}
            </span>
          ))}
          <span className={styles.legendItem} style={{ color: "#89979b" }}>
            solid = actual · dashed = forecast · ● = predicted peak
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.chartCol}>
      <div className={styles.chartHeader}>
        <H2>Projected Demand vs Capacity by Region</H2>
        {isRefreshing && regions?.length > 0 && (
          <span className={styles.updating}>updating…</span>
        )}
      </div>
      <div className={styles.chartCard}>
        <ShowDocButton scope="forecasting" component="capacity" />
        {body}
      </div>
      <p className={styles.peakNote}>
        Each region&apos;s coincident demand is projected forward with a moving
        average scaled by an hour-of-day and day-of-week profile, then normalized
        to that region&apos;s own <strong>capacity_kw</strong> so localized
        capacity pressure is directly comparable.
      </p>
    </div>
  );
}
