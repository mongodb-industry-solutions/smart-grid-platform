"use client";

import { useMemo } from "react";
import { useNetworkTree } from "@/components/network/useNetworkTree";
import styles from "@/app/control-center/control-center.module.css";

// Live-status ramp — same tokens the overview uses.
const STATUS_COLOR = { normal: "#00A35C", warning: "#D97706", critical: "#DB3030", unknown: "#C1C7C6" };
const STATUS_LABEL = { normal: "Normal", warning: "Warning", critical: "Critical", unknown: "No data" };

const COL_SUB = 215; // x of substation nodes
const COL_FEEDER = 545; // x of feeder nodes
const ROW = 30;
const PAD_Y = 22;
const VIEW_W = 800;

// Meters (customers) under a node, any depth.
function meterCountOf(node) {
  let n = node.meters ? node.meters.length : 0;
  (node.children || []).forEach((c) => (n += meterCountOf(c)));
  return n;
}
// Installed capacity under a node (sum of transformer capacities).
function capacityOf(node) {
  if (node.children && node.children.length) return node.children.reduce((s, c) => s + capacityOf(c), 0);
  return node.capacityKw ?? 0;
}

// Flatten the scoped hierarchy to substation → feeder and lay it out as a
// left-to-right node-link tree (substations centered on their feeders).
function useMapModel(tree, scope) {
  return useMemo(() => {
    const utilities = scope === "all" ? tree : tree.filter((u) => u.id === scope);
    const nodes = [];
    const links = [];
    let leaf = 0;

    const toNode = (src, type, x, y) => ({
      id: src.id,
      name: src.name,
      type,
      x,
      y,
      capacityKw: capacityOf(src),
      meterCount: meterCountOf(src),
    });

    for (const u of utilities) {
      for (const sub of u.children || []) {
        const feeders = sub.children || [];
        const feederYs = [];
        for (const f of feeders) {
          const y = PAD_Y + leaf * ROW + ROW / 2;
          leaf += 1;
          feederYs.push(y);
          nodes.push(toNode(f, "feeder", COL_FEEDER, y));
        }
        const sy = feederYs.length
          ? (feederYs[0] + feederYs[feederYs.length - 1]) / 2
          : (() => {
              const y = PAD_Y + leaf * ROW + ROW / 2;
              leaf += 1;
              return y;
            })();
        nodes.push(toNode(sub, "substation", COL_SUB, sy));
        for (const fy of feederYs) links.push({ x1: COL_SUB, y1: sy, x2: COL_FEEDER, y2: fy });
      }
    }

    const height = Math.max(PAD_Y * 2 + leaf * ROW, 320);
    return { nodes, links, height };
  }, [tree, scope]);
}

/**
 * Compact live grid map: substations (left) linked to their feeders (right),
 * every node colored by its live status. Selecting a node opens an Asset detail
 * panel enriched with the live metrics from the control-center overview.
 */
export default function GridMap({ statusById = null, scope = "all", selectedId = null, onSelect }) {
  const { tree, isLoading, error } = useNetworkTree();
  const { nodes, links, height } = useMapModel(tree, scope);

  const statusOf = (id) => (statusById ? statusById[id] ?? "unknown" : "unknown");

  return (
    <div className={styles.card} style={{ flex: 1 }}>
      <div className={styles.cardTitle}>Grid map — live status</div>

      <div style={{ flex: 1, minHeight: 360, display: "flex" }}>
        {isLoading && <div className={styles.empty}>Loading network…</div>}
        {error && <div style={{ color: STATUS_COLOR.critical, fontSize: 12 }}>Error: {error}</div>}

        {!isLoading && !error && (
          <svg viewBox={`0 0 ${VIEW_W} ${height}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
            {links.map((l, i) => (
              <path
                key={i}
                d={`M${l.x1},${l.y1} C${(l.x1 + l.x2) / 2},${l.y1} ${(l.x1 + l.x2) / 2},${l.y2} ${l.x2},${l.y2}`}
                fill="none"
                stroke="#C1C7C6"
                strokeWidth={1.25}
              />
            ))}
            {nodes.map((n) => {
              const status = statusOf(n.id);
              const color = STATUS_COLOR[status];
              const r = n.type === "substation" ? 8 : 5;
              const anchorRight = n.type === "feeder";
              const isSel = selectedId === n.id;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x} ${n.y})`}
                  onClick={() => onSelect?.(n)}
                  style={{ cursor: "pointer" }}
                >
                  {/* Transparent, enlarged hit area so small nodes are easy to click. */}
                  <circle r={14} fill="transparent" />
                  <circle r={r} fill="#ffffff" stroke={color} strokeWidth={isSel ? 3.5 : 2} />
                  <circle r={Math.max(r - 2, 1)} fill={color} fillOpacity={0.9} />
                  <text
                    x={anchorRight ? r + 6 : -(r + 6)}
                    dy={4}
                    fontSize={12}
                    fill="#001E2B"
                    fontWeight={isSel || n.type === "substation" ? 600 : 400}
                    textAnchor={anchorRight ? "start" : "end"}
                  >
                    {n.name}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Status legend */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: "#5C6970", paddingTop: 4 }}>
        {Object.entries(STATUS_COLOR).map(([k, c]) => (
          <span key={k} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }} />
            {STATUS_LABEL[k]}
          </span>
        ))}
      </div>
    </div>
  );
}
