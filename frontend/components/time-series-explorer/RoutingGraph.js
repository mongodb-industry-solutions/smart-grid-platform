"use client";

import { useMemo } from "react";
import styles from "@/style/time-series-explorer/routing.module.css";

const W = 360;
const H = 300;
const CX = W / 2;
const CY = H / 2;
const R = 106;

const SOURCE_COLOR = "#016bf8";
const JOIN_COLOR = "#8f4bd6";
const color = (role) => (role === "source" ? SOURCE_COLOR : JOIN_COLOR);

// Radial view: the produced object sits at the center; every collection the
// pipeline touches sits on the ring, connected by the operator that reads it.
// Answers "what entities is the query hitting?".
export default function RoutingGraph({ routing }) {
  const { entities, stages, output } = routing;

  const nodes = useMemo(() => {
    const n = entities.length;
    return entities.map((e, i) => {
      const ang = ((-90 + i * (360 / Math.max(n, 1))) * Math.PI) / 180;
      return { ...e, x: CX + R * Math.cos(ang), y: CY + R * Math.sin(ang) };
    });
  }, [entities]);

  return (
    <div className={styles.graphWrap}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg}>
        {/* edges: entity → produced object */}
        {nodes.map((n) => (
          <line
            key={`e-${n.name}`}
            x1={n.x}
            y1={n.y}
            x2={CX}
            y2={CY}
            stroke={color(n.role)}
            strokeWidth={n.role === "source" ? 2.5 : 1.6}
            strokeOpacity={0.45}
            strokeDasharray={n.role === "join" ? "5 4" : undefined}
            strokeLinecap="round"
          />
        ))}

        {/* edge role labels */}
        {nodes.map((n) => (
          <text
            key={`l-${n.name}`}
            x={(n.x + CX) / 2}
            y={(n.y + CY) / 2}
            textAnchor="middle"
            fontSize="9"
            fill={color(n.role)}
            fontWeight="600"
          >
            {n.role === "source" ? "reads" : "$lookup"}
          </text>
        ))}

        {/* center: the produced object */}
        <circle cx={CX} cy={CY} r={40} fill="#001e2b" />
        <text x={CX} y={CY - 3} textAnchor="middle" fontSize="11" fontWeight="700" fill="#ffffff">
          result
        </text>
        <text x={CX} y={CY + 11} textAnchor="middle" fontSize="9" fill="#7fd4b0">
          {output.fields.length || "—"} fields
        </text>

        {/* entity nodes */}
        {nodes.map((n) => (
          <g key={n.name}>
            <circle cx={n.x} cy={n.y} r={7} fill={color(n.role)} stroke="#ffffff" strokeWidth="1.5" />
            <text
              x={n.x}
              y={n.y + (n.y < CY ? -14 : 22)}
              textAnchor="middle"
              fontSize="10"
              fontWeight="600"
              fill="#001e2b"
            >
              {n.name}
            </text>
          </g>
        ))}
      </svg>

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.dot} style={{ background: SOURCE_COLOR }} />
          source collection
        </span>
        <span className={styles.legendItem}>
          <span className={styles.dot} style={{ background: JOIN_COLOR }} />
          joined via $lookup
        </span>
        <span className={styles.legendItem}>{stages.length} stages</span>
      </div>
    </div>
  );
}
