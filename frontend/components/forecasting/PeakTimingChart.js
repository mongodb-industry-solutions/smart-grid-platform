"use client";

import { useMemo } from "react";
import { H2, Body } from "@leafygreen-ui/typography";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  Cell,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { AXIS_TICK, TOOLTIP_CONTENT, TOOLTIP_LABEL } from "@/lib/const/chartConfig";
import ShowDocButton from "@/components/customers/ShowDocButton";
import styles from "../../style/forecasting/document-showcase.module.css";

// State → time zone. The demo dataset is January (no DST), so a fixed UTC
// offset is exact: Central = −6, Mountain = −7 (Arizona is MST year-round).
const STATE_TZ = {
  Texas: { zone: "Central", offset: -6 },
  Missouri: { zone: "Central", offset: -6 },
  Tennessee: { zone: "Central", offset: -6 },
  Colorado: { zone: "Mountain", offset: -7 },
  "New Mexico": { zone: "Mountain", offset: -7 },
  Arizona: { zone: "Mountain", offset: -7 },
};

// One stable color per zone.
const ZONE_COLOR = { Central: "#016bf8", Mountain: "#00a35c" };
const ZONE_FALLBACK = "#889397";

const fmtHour = (h) => `${String(Math.round(h)).padStart(2, "0")}:00`;

// UTC peak hour → local hour in the region's zone, wrapped to [0, 24).
function toLocalHour(peakHourUtc, offset) {
  return (((peakHourUtc + offset) % 24) + 24) % 24;
}

function TimingTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={TOOLTIP_CONTENT}>
      <div style={{ ...TOOLTIP_LABEL, marginBottom: 4 }}>{p.region}</div>
      <div>Peak hour: {fmtHour(p.localHour)} local ({p.zone})</div>
      <div style={{ color: "#889397" }}>{fmtHour(p.peakHour)} UTC</div>
      <div>Expected peak: {p.peak} kW</div>
    </div>
  );
}

export default function PeakTimingChart({ bars, isLoading, isRefreshing, error }) {
  // Map each region to its local peak hour + zone. Regions with an unknown
  // state fall back to UTC so nothing silently disappears.
  const points = useMemo(() => {
    return (bars ?? []).map((b) => {
      const tz = STATE_TZ[b.region];
      const offset = tz?.offset ?? 0;
      return {
        region: b.region,
        zone: tz?.zone ?? "UTC",
        peak: b.peak,
        peakHour: b.peakHour,
        localHour: toLocalHour(b.peakHour, offset),
      };
    });
  }, [bars]);

  // Headline: how tightly the regional peaks cluster in local time. A narrow
  // spread means near-simultaneous stress; a wide one means staggered load.
  const insight = useMemo(() => {
    if (points.length < 2) return null;
    const hours = points.map((p) => p.localHour);
    const min = Math.min(...hours);
    const max = Math.max(...hours);
    const spread = max - min;
    const zones = new Set(points.map((p) => p.zone)).size;
    return { min, max, spread, zones, coincident: spread <= 2 };
  }, [points]);

  let body;
  if (error) {
    body = <Body>Error: {error}</Body>;
  } else if (isLoading) {
    body = <Body>Loading peak timing…</Body>;
  } else if (points.length === 0) {
    body = <Body>No demand data for the selected filters.</Body>;
  } else {
    const height = Math.max(200, points.length * 54 + 40);
    body = (
      <div className={isRefreshing ? styles.refreshing : undefined}>
        <ResponsiveContainer width="100%" height={height}>
          <ScatterChart margin={{ top: 10, right: 24, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8edeb" horizontal={false} />
            <XAxis
              type="number"
              dataKey="localHour"
              domain={[0, 24]}
              ticks={[0, 6, 12, 18, 24]}
              tickFormatter={fmtHour}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: "#e8edeb" }}
              label={{
                value: "Expected peak hour (local time)",
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
            <ZAxis type="number" dataKey="peak" range={[120, 480]} />
            {/* Evening peak band for reference. */}
            <ReferenceLine x={18} stroke="#e8edeb" strokeDasharray="4 4" />
            <Tooltip content={<TimingTooltip />} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={points} isAnimationActive={false}>
              {points.map((p) => (
                <Cell key={p.region} fill={ZONE_COLOR[p.zone] ?? ZONE_FALLBACK} fillOpacity={0.8} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>

        <div className={styles.legend} style={{ border: "none", background: "transparent", paddingTop: 4 }}>
          {Object.entries(ZONE_COLOR).map(([zone, color]) => (
            <span key={zone} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: color }} />
              {zone}
            </span>
          ))}
          <span className={styles.legendItem} style={{ color: "#89979b" }}>
            dot size = peak kW
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.chartCol}>
      <div className={styles.chartHeader}>
        <H2>Peak Timing by Time Zone</H2>
        {isRefreshing && points.length > 0 && (
          <span className={styles.updating}>updating…</span>
        )}
      </div>
      <div className={styles.chartCard}>
        <ShowDocButton scope="forecasting" component="peak" />
        {body}
      </div>
      <p className={styles.peakNote}>
        {insight ? (
          <>
            Regional peaks land between {fmtHour(insight.min)} and {fmtHour(insight.max)} local
            time across {insight.zones} time zone{insight.zones > 1 ? "s" : ""} —{" "}
            {insight.coincident
              ? "tightly coincident, so demand stacks up near-simultaneously across the grid."
              : "staggered through the day, spreading load and easing coincident peak stress."}
          </>
        ) : (
          <>Each region&apos;s expected peak hour, converted from UTC to its local time zone.</>
        )}
      </p>
    </div>
  );
}
