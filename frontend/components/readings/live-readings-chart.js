"use client";

import { useEffect, useRef, useState } from "react";
import { H2, Body } from "@leafygreen-ui/typography";
import * as am5 from "@amcharts/amcharts5";
import * as am5xy from "@amcharts/amcharts5/xy";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";
import styles from "../../style/readings/live-readings-chart.module.css";

const TICK_MS = 2_000;
const MAX_HISTORY = 48;
const LIMIT = 250; // meters averaged per reading (the whole fleet)
const LINE_COLOR = 0x00684a;
const AXIS_LABEL_COLOR = 0x5c6970; // matches AXIS_TICK on the other charts
const GRID_COLOR = 0xe8edeb;

export default function LiveReadingsChart() {
  const [error, setError] = useState("");

  const chartDivRef = useRef(null);
  const rootRef = useRef(null);
  const seriesRef = useRef(null);
  const xAxisRef = useRef(null);

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
        baseInterval: { timeUnit: "second", count: TICK_MS / 1000 },
        renderer: am5xy.AxisRendererX.new(root, { minGridDistance: 70 }),
        tooltip: am5.Tooltip.new(root, {}),
      })
    );
    xAxisRef.current = xAxis;
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

  // Live data feed.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    let periodIndex = 0;
    let active = true;
    let prevDate = null;
    let baseIntervalSet = false;
    let id;
    series.data.setAll([]);

    const fetchTick = async () => {
      try {
        const res = await fetch(
          `/api/monitoring-panel/reading-logs?periodIndex=${periodIndex}&limit=${LIMIT}`
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!active) return;

        // No more periods in the dataset — stop; don't invent readings.
        if (!data.length) {
          clearInterval(id);
          return;
        }

        const avg =
          data.reduce((sum, r) => sum + (r.power ?? 0), 0) / data.length / 1000;
        const value = parseFloat(avg.toFixed(2));
        const date = new Date(data[0].timestamp).getTime();

        // Match the axis grid to the real cadence between readings.
        if (!baseIntervalSet && prevDate != null && date > prevDate) {
          xAxisRef.current?.set("baseInterval", {
            timeUnit: "millisecond",
            count: date - prevDate,
          });
          baseIntervalSet = true;
        }
        prevDate = date;

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
          duration: TICK_MS * 0.8,
          easing: am5.ease.linear,
        });

        periodIndex += 1;
        setError("");
      } catch (err) {
        if (active) setError(err.message);
      }
    };

    fetchTick();
    id = setInterval(fetchTick, TICK_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <div>
          <div className={styles.titleRow}>
            <H2>Average Power</H2>
            <span className={styles.liveBadge}>
              <span className={styles.liveDot} />
              LIVE
            </span>
          </div>
          <Body style={{ fontSize: 12, color: "#5C6970", marginTop: 2 }}>
            Average power per meter (kW), across all {LIMIT} live meters - one
            point per reading interval, updated every {TICK_MS / 1000}s.
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
