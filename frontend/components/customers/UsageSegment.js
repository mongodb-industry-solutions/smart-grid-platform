"use client";

import { PieChart, Pie } from "recharts";
import { useUsageSegment } from "./useUsageSegment";
import styles from "../../style/customers/customers.module.css";

const CX = 70, CY = 70;

function percentileColor(pct) {
  if (pct < 33) return "#00684A";
  if (pct < 67) return "#D4730A";
  return "#DB3030";
}

function DonutGauge({ percentile }) {
  const color = percentileColor(percentile);
  const filled = percentile / 100;
  const data = [
    { value: filled,      fill: color },
    { value: 1 - filled,  fill: "#e8edeb" },
  ];

  return (
    <div style={{ position: "relative", width: 140, height: 140, flexShrink: 0 }}>
      <PieChart width={140} height={140} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <Pie
          data={data}
          cx={CX} cy={CY}
          startAngle={90} endAngle={-270}
          innerRadius={46} outerRadius={62}
          dataKey="value"
          strokeWidth={0}
          isAnimationActive
          animationDuration={700}
          animationEasing="ease-out"
        />
      </PieChart>
      <div className={styles.segmentCenter}>
        <span className={styles.segmentPctNum} style={{ color }}>
          {percentile}
          <span className={styles.segmentPctSuffix}>
            {percentile % 100 >= 11 && percentile % 100 <= 13
              ? "th"
              : percentile % 10 === 1
                ? "st"
                : percentile % 10 === 2
                  ? "nd"
                  : percentile % 10 === 3
                    ? "rd"
                    : "th"}
          </span>
        </span>
        <span className={styles.segmentPctLabel}>percentile</span>
      </div>
    </div>
  );
}

function fmtW(watts) {
  if (watts >= 1000) return `${(watts / 1000).toFixed(1)} kW`;
  return `${watts} W`;
}

function SegmentMessage({ percentile, segmentName }) {
  const color = percentileColor(percentile);
  if (percentile < 33) {
    return (
      <p className={styles.segmentHeadline}>
        Lower than{" "}
        <strong style={{ color }}>{100 - percentile}%</strong>{" "}
        of customers in the <strong>{segmentName}</strong> plan
      </p>
    );
  }
  if (percentile <= 66) {
    return (
      <p className={styles.segmentHeadline}>
        <strong style={{ color }}>Within average</strong>{" "}
        for the <strong>{segmentName}</strong> plan
        {" — "}at the{" "}
        <strong style={{ color }}>{percentile}th</strong> percentile
      </p>
    );
  }
  return (
    <p className={styles.segmentHeadline}>
      Higher than{" "}
      <strong style={{ color }}>{percentile}%</strong>{" "}
      of customers in the <strong>{segmentName}</strong> plan
    </p>
  );
}

export default function UsageSegment({ dataid }) {
  const { data, isLoading, error } = useUsageSegment(dataid);

  if (!dataid) {
    return (
      <div className={styles.card}>
        <div className={styles.empty}>Select a customer to view usage segment.</div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Usage Segment</div>

      {isLoading && !data ? (
        <div className={styles.segmentSkeleton} />
      ) : error ? (
        <div className={styles.empty} style={{ color: "#DB3030" }}>{error}</div>
      ) : data ? (
        <div className={styles.segmentBody}>
          <DonutGauge percentile={data.percentile} />
          <div className={styles.segmentInfo}>
            <SegmentMessage percentile={data.percentile} segmentName={data.segmentName} />
            <div className={styles.segmentMetrics}>
              <div className={styles.segmentMetric}>
                <span className={styles.segmentMetricLabel}>Avg draw</span>
                <span className={styles.segmentMetricValue}>{fmtW(data.customerAvgW)}</span>
              </div>
              <div className={styles.segmentMetric}>
                <span className={styles.segmentMetricLabel}>Segment avg</span>
                <span className={styles.segmentMetricValue}>{fmtW(data.segmentAvgW)}</span>
              </div>
              <div className={styles.segmentMetric}>
                <span className={styles.segmentMetricLabel}>Customers in segment</span>
                <span className={styles.segmentMetricValue}>{data.segmentSize}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
