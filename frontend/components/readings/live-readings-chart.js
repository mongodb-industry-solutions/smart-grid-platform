"use client";

import { useEffect, useRef, useState } from "react";
import { H2, Body } from "@leafygreen-ui/typography";
import * as am5 from "@amcharts/amcharts5";
import * as am5xy from "@amcharts/amcharts5/xy";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";
import styles from "../../style/readings/live-readings-chart.module.css";
import { useStream } from "@/lib/streaming/useStream";

const MAX_HISTORY = 48;
const LIMIT = 250; // meters averaged per reading (the whole fleet)
const LINE_COLOR = 0x00684a;
const AXIS_LABEL_COLOR = 0x5c6970; // matches AXIS_TICK on the other charts
const GRID_COLOR = 0xe8edeb;

export default function LiveReadingsChart() {
  const [error, setError] = useState("");
  const { readings: streamReadings, lastEventAt } = useStream();
  const [seedHistory, setSeedHistory] = useState(null);

  const chartDivRef = useRef(null);
  const rootRef = useRef(null);
  const seriesRef = useRef(null);
  const xAxisRef = useRef(null);

  // When the feeder is off the stream is silent — seed the chart with the
  // last-known fleet-average power history so the panel isn't empty.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/readings/live-seed")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.history)) {
          setSeedHistory(
            data.history.map((p) => ({
              date: new Date(p.date).getTime(),
              value: parseFloat((p.value ?? 0).toFixed(2)),
            }))
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Push seed history into the chart once both chart and seed data exist.
  // Only while the stream is silent: seeded points are ~15 min apart, so
  // keeping them alongside live points (seconds apart) would stretch the axis
  // over hours and squash the live data into a single vertical line.
  const seedClearedRef = useRef(false);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !seedHistory?.length || seedClearedRef.current) return;
    series.data.setAll(seedHistory);
  }, [seedHistory]);

  // Build the amCharts live chart once (client-only).
  useEffect(() => {
    const root = am5.Root.new(chartDivRef.current);
    rootRef.current = root;
    root.setThemes([am5themes_Animated.new(root)]);
    // Remove the amCharts logo.
    root._logo?.dispose();

    const chart = root.container.children.push(
      am5xy.XYChart.new(root, {
        panX: false,
        panY: false,
        wheelX: "none",
        wheelY: "none",
        paddingLeft: 0,
        paddingRight: 10,
        paddingTop: 8,
      })
    );

    const xAxis = chart.xAxes.push(
      am5xy.DateAxis.new(root, {
        maxDeviation: 0.5,
        groupData: false,
        extraMax: 0.05,
        baseInterval: { timeUnit: "second", count: 1 },
        // Candidate grid steps. Live ticks are seconds apart, so start at 10s
        // and let amCharts pick a coarser step only if the window really is
        // wider (e.g. while showing seeded history).
        gridIntervals: [
          { timeUnit: "second", count: 10 },
          { timeUnit: "second", count: 30 },
          { timeUnit: "minute", count: 1 },
          { timeUnit: "minute", count: 5 },
          { timeUnit: "minute", count: 15 },
          { timeUnit: "hour", count: 1 },
        ],
        renderer: am5xy.AxisRendererX.new(root, { minGridDistance: 70 }),
        tooltip: am5.Tooltip.new(root, {}),
      })
    );
    xAxisRef.current = xAxis;
    // Always label the axis with a time of day. The seeded history is 15-min
    // apart while live ticks are seconds apart; without this amCharts switches
    // to day/month labels on the wider seed span, which reads as "one point per
    // day" even though each point is one reading interval.
    xAxis.set("dateFormats", {
      millisecond: "HH:mm:ss",
      second: "HH:mm:ss",
      minute: "HH:mm",
      hour: "HH:mm",
      day: "MMM d HH:mm",
    });
    xAxis.set("periodChangeDateFormats", {
      millisecond: "HH:mm:ss",
      second: "HH:mm:ss",
      minute: "HH:mm",
      hour: "HH:mm",
      day: "MMM d HH:mm",
    });
    xAxis.get("renderer").labels.template.setAll({
      fontSize: 11,
      fill: am5.color(AXIS_LABEL_COLOR),
    });
    xAxis.get("renderer").grid.template.setAll({
      stroke: am5.color(GRID_COLOR),
      strokeOpacity: 1,
    });

    const yAxis = chart.yAxes.push(
      am5xy.ValueAxis.new(root, {
        maxDeviation: 1,
        renderer: am5xy.AxisRendererY.new(root, {}),
      })
    );
    yAxis.get("renderer").labels.template.setAll({
      fontSize: 11,
      fill: am5.color(AXIS_LABEL_COLOR),
    });
    yAxis.get("renderer").grid.template.setAll({
      stroke: am5.color(GRID_COLOR),
      strokeOpacity: 1,
    });
    yAxis.children.unshift(
      am5.Label.new(root, {
        text: "Avg power per meter (kW)",
        rotation: -90,
        y: am5.p50,
        centerX: am5.p50,
        fontSize: 11,
        fill: am5.color(AXIS_LABEL_COLOR),
      })
    );

    const series = chart.series.push(
      am5xy.LineSeries.new(root, {
        name: "Avg power per meter (kW)",
        xAxis,
        yAxis,
        valueYField: "value",
        valueXField: "date",
        stroke: am5.color(LINE_COLOR),
        fill: am5.color(LINE_COLOR),
        tooltip: am5.Tooltip.new(root, { labelText: "Avg: {valueY} kW / meter" }),
      })
    );
    series.strokes.template.setAll({ strokeWidth: 2 });

    // Circular markers, like the amCharts live demo.
    series.bullets.push(() =>
      am5.Bullet.new(root, {
        sprite: am5.Circle.new(root, { radius: 3, fill: series.get("fill") }),
      })
    );

    chart.set("cursor", am5xy.XYCursor.new(root, { xAxis, behavior: "none" }));

    seriesRef.current = series;

    return () => {
      root.dispose();
      rootRef.current = null;
      seriesRef.current = null;
      xAxisRef.current = null;
    };
  }, []);

  // Push SSE stream data into the chart.
  const lastPushedDateRef = useRef(null);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !streamReadings.length) return;

    const data = streamReadings;
    const avg =
      data.reduce((sum, r) => sum + (r.power ?? 0), 0) / data.length / 1000;
    const value = parseFloat(avg.toFixed(2));
    const date = new Date(data[0].timestamp).getTime();

    // Skip duplicate timestamps.
    if (date === lastPushedDateRef.current) return;
    lastPushedDateRef.current = date;

    // First live point: discard the seeded history. Seed points are minutes
    // apart, so keeping them would hold the axis at an hours-wide span and the
    // live readings would pile up at the right edge.
    if (!seedClearedRef.current) {
      seedClearedRef.current = true;
      series.data.clear();
    }

    const prev =
      series.dataItems[series.dataItems.length - 1]?.get("valueY") ?? value;
    series.data.push({ date, value });
    if (series.dataItems.length > MAX_HISTORY) series.data.removeIndex(0);

    // Animate the new point sliding in from the previous value.
    const di = series.dataItems[series.dataItems.length - 1];
    di.animate({
      key: "valueYWorking",
      to: value,
      from: prev,
      duration: 2400,
      easing: am5.ease.linear,
    });

    setError("");
  }, [streamReadings]);

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <div>
          <div className={styles.titleRow}>
            <H2>Average Power</H2>
            {lastEventAt ? (
              <span className={styles.liveBadge}>
                <span className={styles.liveDot} />
                LIVE
              </span>
            ) : (
              <span className={styles.pausedBadge}>FEEDER OFF</span>
            )}
          </div>
          <Body style={{ fontSize: 12, color: "#5C6970", marginTop: 2 }}>
            {lastEventAt
              ? `Average power per meter (kW), across all ${LIMIT} live meters - one point per reading interval, updated via live stream.`
              : "Showing last known values. Start the feeder simulation (toggle, top right) to stream live readings."}
          </Body>
        </div>
      </div>

      {error && <Body style={{ color: "#DB3030" }}>Error: {error}</Body>}

      <div className={styles.chartWrapper}>
        <div ref={chartDivRef} style={{ width: "100%", height: 320 }} />
      </div>
    </div>
  );
}
