"use client";

import { useMemo } from "react";
import { useNetworkTree } from "@/components/network/useNetworkTree";
import { Panel } from "@/components/network-center/panels";
import styles from "@/style/network-center/network-center.module.css";

// Live-status ramp (light theme).
const STATUS_COLOR = { normal: "#00A35C", warning: "#D97706", critical: "#DB3030", unknown: "#C1C7C6" };
const STATUS_LABEL = { normal: "Normal", warning: "Near capacity", critical: "Critical" };
const STATUS_RANK = { unknown: 0, normal: 1, warning: 2, critical: 3 };
const NODE_FILL = "#ffffff";

const VIEW_W = 1000;
const VIEW_H = 720;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;
// Elliptical rings sized to fill the center-column panel (~1.4:1 landscape).
const RX_U = 380, RY_U = 250;   // utility (city) nodes
const RX_F = 445, RY_F = 300;   // feeder stubs
const RX_T = 490, RY_T = 330;   // transformer stubs (shown on click)
const MIN_GAP = 0.55;           // min angular separation between spokes (rad)

const worst = (arr) => arr.reduce((a, b) => (STATUS_RANK[b] > STATUS_RANK[a] ? b : a), "unknown");

function meterCountOf(node) {
  let n = node.meters ? node.meters.length : 0;
  (node.children || []).forEach((c) => (n += meterCountOf(c)));
  return n;
}
function capacityOf(node) {
  if (node.children && node.children.length) return node.children.reduce((s, c) => s + capacityOf(c), 0);
  return node.capacityKw ?? 0;
}
function statusOf(node, statusById, inherited) {
  const own = statusById && statusById[node.id] ? statusById[node.id] : null;
  const children = node.children || [];
  if (!children.length) return own ?? inherited ?? "unknown";
  return own ?? worst(children.map((c) => statusOf(c, statusById, own ?? inherited)));
}
const at = (angle, rx, ry) => ({ x: CX + rx * Math.cos(angle), y: CY + ry * Math.sin(angle) });

/**
 * Hub-and-spoke layout. Utilities are ordered by geographic bearing from the
 * network centroid, then spaced evenly around the core so no two spokes overlap.
 * Each utility fans out to its feeders, and each feeder to its transformers.
 */
function useGraph(tree, scope, statusById, loadById) {
  return useMemo(() => {
    const utilities = scope === "all" ? tree : tree.filter((u) => u.id === scope);
    const n = utilities.length || 1;

    // Geographic centroid → bearing per utility (north up), then sort by bearing.
    const lons = utilities.map((u) => u.lon).filter((v) => v != null);
    const lats = utilities.map((u) => u.lat).filter((v) => v != null);
    const lonC = lons.reduce((s, v) => s + v, 0) / (lons.length || 1);
    const latC = lats.reduce((s, v) => s + v, 0) / (lats.length || 1);
    const ordered = utilities
      .map((u) => ({ u, bearing: u.lon == null ? 0 : Math.atan2(-(u.lat - latC), u.lon - lonC) }))
      .sort((a, b) => a.bearing - b.bearing);

    // Keep each utility at its true bearing, but push neighbours apart to at
    // least MIN_GAP so spokes never overlap. Fall back to even spacing if the
    // bearings are too clustered to fit around the circle.
    const angles = ordered.map((o) => o.bearing);
    for (let i = 1; i < n; i++) {
      if (angles[i] < angles[i - 1] + MIN_GAP) angles[i] = angles[i - 1] + MIN_GAP;
    }
    if (n > 1 && angles[n - 1] - angles[0] > Math.PI * 2 - MIN_GAP) {
      for (let i = 0; i < n; i++) angles[i] = angles[0] + (i / n) * Math.PI * 2;
    }

    const spokes = ordered.map(({ u }, i) => {
      const angle = n === 1 ? -Math.PI / 2 : angles[i];
      const up = at(angle, RX_U, RY_U);
      const capacityKw = capacityOf(u);
      const loadKw = loadById?.[u.id] ?? 0;
      const utilizationPct = capacityKw > 0 ? Math.round((loadKw / capacityKw) * 1000) / 10 : null;

      const feeders = [];
      for (const sub of u.children || []) for (const f of sub.children || []) feeders.push(f);
      const shown = feeders.slice(0, 3);
      const stubs = shown.map((f, k) => {
        const fa = angle + (k - (shown.length - 1) / 2) * 0.24;
        const fp = at(fa, RX_F, RY_F);
        const xfmrs = (f.children || []).slice(0, 2).map((t, j, arr) => {
          const ta = fa + (j - (arr.length - 1) / 2) * 0.12;
          const tp = at(ta, RX_T, RY_T);
          return { id: t.id, name: t.name, type: "transformer", x: tp.x, y: tp.y, status: statusOf(t, statusById), capacityKw: capacityOf(t), meterCount: meterCountOf(t) };
        });
        return { id: f.id, name: f.name, type: "feeder", x: fp.x, y: fp.y, status: statusOf(f, statusById), capacityKw: capacityOf(f), meterCount: meterCountOf(f), xfmrs };
      });

      return {
        id: u.id,
        name: u.city || u.name.replace(/ Utility$/i, ""),
        type: "utility",
        x: up.x,
        y: up.y,
        status: statusOf(u, statusById),
        loadKw,
        utilizationPct,
        capacityKw,
        meterCount: meterCountOf(u),
        stubs,
      };
    });

    return { spokes };
  }, [tree, scope, statusById, loadById]);
}

function curve(x1, y1, x2, y2, bow = 0.1) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  return `M${x1},${y1} Q${mx - dy * bow},${my + dx * bow} ${x2},${y2}`;
}

/**
 * Grid map as a light hub-and-spoke network graph: central Grid core, one city
 * node per utility (live MW + customers), feeders and transformers fanning out,
 * colored by live status. Click a node for the Asset Detail panel.
 */
export default function GridMap({ statusById = null, loadById = null, totals = null, scope = "all", selectedId = null, onSelect }) {
  const { tree, isLoading, error } = useNetworkTree();
  const { spokes } = useGraph(tree, scope, statusById, loadById);
  const coreStatus = worst(spokes.map((s) => s.status));

  return (
    <Panel title="Grid Map" bodyClassName={styles.mapBody}>
      <div className={styles.mapCanvas}>
        {isLoading && <div className={styles.empty}>Loading network…</div>}
        {error && <div style={{ color: STATUS_COLOR.critical, fontSize: 12 }}>Error: {error}</div>}

        {!isLoading && !error && (
          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
            {Array.from({ length: Math.ceil(VIEW_W / 60) + 1 }).map((_, i) => (
              <line key={`v${i}`} x1={i * 60} y1={0} x2={i * 60} y2={VIEW_H} stroke="#001E2B" strokeOpacity={0.04} />
            ))}
            {Array.from({ length: Math.ceil(VIEW_H / 60) + 1 }).map((_, i) => (
              <line key={`h${i}`} x1={0} y1={i * 60} x2={VIEW_W} y2={i * 60} stroke="#001E2B" strokeOpacity={0.04} />
            ))}

            {/* Edges */}
            {spokes.map((s) => {
              const c = STATUS_COLOR[s.status] ?? STATUS_COLOR.unknown;
              return (
                <g key={`e-${s.id}`}>
                  <path d={curve(CX, CY, s.x, s.y)} fill="none" stroke={c} strokeOpacity={0.9} strokeWidth={2} />
                  {s.stubs.map((st) => {
                    const sc = STATUS_COLOR[st.status] ?? STATUS_COLOR.unknown;
                    const showT = selectedId === s.id || selectedId === st.id || st.xfmrs.some((t) => t.id === selectedId);
                    return (
                      <g key={`e-${st.id}`}>
                        <line x1={s.x} y1={s.y} x2={st.x} y2={st.y} stroke={sc} strokeOpacity={0.55} strokeWidth={1.4} />
                        {showT && st.xfmrs.map((t) => (
                          <line key={`e-${t.id}`} x1={st.x} y1={st.y} x2={t.x} y2={t.y} stroke={STATUS_COLOR[t.status]} strokeOpacity={0.4} strokeWidth={1} />
                        ))}
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* Transformers (outermost, small hollow) — only when their branch is selected */}
            {spokes.flatMap((s) =>
              s.stubs.flatMap((st) =>
                (selectedId === s.id || selectedId === st.id || st.xfmrs.some((t) => t.id === selectedId) ? st.xfmrs : []).map((t) => {
                  const c = STATUS_COLOR[t.status] ?? STATUS_COLOR.unknown;
                  const isSel = selectedId === t.id;
                  return (
                    <g key={t.id} transform={`translate(${t.x} ${t.y})`} onClick={() => onSelect?.(t)} style={{ cursor: "pointer" }}>
                      <title>{`${t.name} — ${t.meterCount} customers`}</title>
                      <circle r={10} fill="transparent" />
                      <circle r={3.5} fill={NODE_FILL} stroke={c} strokeWidth={isSel ? 2.5 : 1.5} />
                    </g>
                  );
                })
              )
            )}

            {/* Feeder stubs */}
            {spokes.flatMap((s) =>
              s.stubs.map((st) => {
                const c = STATUS_COLOR[st.status] ?? STATUS_COLOR.unknown;
                const isSel = selectedId === st.id;
                return (
                  <g key={st.id} transform={`translate(${st.x} ${st.y})`} onClick={() => onSelect?.(st)} style={{ cursor: "pointer" }}>
                    <title>{`${st.name} — ${st.meterCount} customers`}</title>
                    <circle r={11} fill="transparent" />
                    <circle r={5} fill={NODE_FILL} stroke={c} strokeWidth={isSel ? 3 : 2} />
                    <circle r={2} fill={c} />
                  </g>
                );
              })
            )}

            {/* Utility (city) nodes */}
            {spokes.map((s) => {
              const c = STATUS_COLOR[s.status] ?? STATUS_COLOR.unknown;
              const isSel = selectedId === s.id;
              const near = s.status !== "normal";
              const r = near ? 11 : 8;
              const below = s.y > CY;
              const loadLabel = near && s.utilizationPct != null ? `${s.utilizationPct}% capacity` : `${(s.loadKw / 1000).toFixed(1)} MW`;
              return (
                <g key={s.id} transform={`translate(${s.x} ${s.y})`} onClick={() => onSelect?.(s)} style={{ cursor: "pointer" }}>
                  <title>{`${s.name} — ${s.meterCount} customers`}</title>
                  <circle r={r * 2.4} fill={c} fillOpacity={near ? 0.16 : 0.1} />
                  <circle r={13} fill="transparent" />
                  <circle r={r} fill={NODE_FILL} stroke={c} strokeWidth={isSel ? 3.5 : 2.5} />
                  <circle r={Math.max(r - 3, 2)} fill={c} />
                  <text y={below ? r + 18 : -(r + 20)} textAnchor="middle" fontSize={14} fontWeight={600} fill="#001E2B">
                    {s.name}
                  </text>
                  <text y={below ? r + 33 : -(r + 6)} textAnchor="middle" fontSize={11} fill={near ? c : "#5C6970"}>
                    {loadLabel} · {s.meterCount.toLocaleString()} cust
                  </text>
                </g>
              );
            })}

            {/* Grid core hub */}
            <g transform={`translate(${CX} ${CY})`}>
              <circle r={32} fill={STATUS_COLOR[coreStatus]} fillOpacity={0.12} />
              <circle r={16} fill={NODE_FILL} stroke={STATUS_COLOR[coreStatus]} strokeWidth={3} />
              <circle r={7} fill={STATUS_COLOR[coreStatus]} />
              <text y={40} textAnchor="middle" fontSize={13} fontWeight={600} fill="#3D4F58">Grid core</text>
            </g>
          </svg>
        )}

        {/* Legend + totals overlay */}
        <div className={styles.mapOverlay}>
          <div className={styles.mapLegendDark}>
            {["normal", "warning", "critical"].map((k) => (
              <span key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: STATUS_COLOR[k], display: "inline-block" }} />
                {STATUS_LABEL[k]}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
