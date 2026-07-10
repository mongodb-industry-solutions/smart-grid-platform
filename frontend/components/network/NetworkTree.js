"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@leafygreen-ui/icon";
import { H2, Body, Error as ErrorText } from "@leafygreen-ui/typography";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import { useNetworkTree } from "./useNetworkTree";

// ── MongoDB brand palette ───────────────────────────────────────────────────
const MDB = {
  slate: "#001E2B",      // Evergreen slate (dark surfaces / text)
  evergreen: "#023430",
  forest: "#00684A",     // primary green
  green: "#00A35C",
  spring: "#00ED64",     // signature bright accent
  mist: "#E3FCF7",
  white: "#FFFFFF",
  card: "#FFFFFF",
  canvas: "#F9FBFA",
  border: "#C1C7C6",
  borderSubtle: "#E8EDEB",
  text: "#001E2B",
  muted: "#5C6970",
  faint: "#889397",
};
// Node type = a green ramp (higher level = darker), so depth reads as shade.
const TYPE_COLOR = { utility: "#023430", substation: "#00684A", feeder: "#00A35C", transformer: "#00ED64" };
// Live-status ramp, used instead of TYPE_COLOR when a statusById map is supplied.
const STATUS_COLOR = { normal: "#00A35C", warning: "#D97706", critical: "#DB3030", unknown: "#C1C7C6" };
const STATUS_LABEL = { normal: "Normal", warning: "Warning", critical: "Critical", unknown: "No data" };
const ICONS = { utility: "GovernmentBuilding", substation: "LightningBolt", feeder: "Diagram3", transformer: "Apps" };
const NODE_R = { utility: 7, substation: 6, feeder: 5, transformer: 4 };
const TYPE_LABEL = { utility: "Utility", substation: "Substation", feeder: "Feeder", transformer: "Transformer" };
// Categorical (per utility), green-forward but distinct.
const CAT = ["#00684A", "#00A35C", "#00ED64", "#0498EC", "#FFC010", "#016BF8", "#B45AF2"];

const LEVEL_DEPTH = { substation: 1, feeder: 2, transformer: 3 };
const COL = 235, ROW = 30, LPAD = 40, TPAD = 20, VIEW_W = 900, VIEW_H = 440;
const TM_W = 880, TM_H = 300, TM_HEADER = 15, TM_PAD = 3;

function countMeters(node) {
  if (node.meters) return node.meters.length;
  if (node.children) return node.children.reduce((s, c) => s + countMeters(c), 0);
  return 0;
}
function countByType(node, type) {
  let n = node.type === type ? 1 : 0;
  (node.children || []).forEach((c) => (n += countByType(c, type)));
  return n;
}
function capacityOf(node) {
  if (node.children && node.children.length) return node.children.reduce((s, c) => s + capacityOf(c), 0);
  return node.capacityKw ?? 0;
}
const valueOf = (node, sizeBy) => (sizeBy === "capacity" ? capacityOf(node) : countMeters(node));

// Left-to-right dendrogram layout: x = depth (level), leaves stack by row, each
// parent centers on its children. Only expanded branches (within the level-of-
// detail) contribute nodes.
function layoutTree(roots, expandedIds, maxDepth) {
  const nodes = [], links = [];
  let leafRow = 0;
  function walk(node, depth, parentEntry) {
    const expandable = !!(node.children && node.children.length) && depth < maxDepth;
    const expanded = expandable && expandedIds.has(node.id);
    const entry = { data: node, depth, x: LPAD + depth * COL, y: 0, expandable, expanded, parent: parentEntry };
    nodes.push(entry);
    if (parentEntry) links.push({ key: node.id, source: parentEntry, target: entry });
    if (expanded) {
      const childYs = node.children.map((c) => walk(c, depth + 1, entry));
      entry.y = (childYs[0] + childYs[childYs.length - 1]) / 2;
    } else {
      entry.y = TPAD + leafRow * ROW + ROW / 2;
      leafRow += 1;
    }
    return entry.y;
  }
  roots.forEach((r) => walk(r, 0, null));
  return { nodes, links };
}
const linkPath = (s, t) => {
  const midX = (s.x + t.x) / 2;
  return `M${s.x},${s.y} C${midX},${s.y} ${midX},${t.y} ${t.x},${t.y}`;
};
// All asset ids in scope whose name/city matches a query (for search dimming),
// regardless of whether their branch is currently expanded.
function collectMatches(nodes, q, set) {
  for (const n of nodes) {
    if (n.name.toLowerCase().includes(q) || (n.city || "").toLowerCase().includes(q)) set.add(n.id);
    if (n.children) collectMatches(n.children, q, set);
  }
  return set;
}

function layoutTreemap(roots, targetDepth, sizeBy, regionColorOf) {
  const tiles = [];
  function place(siblings, x, y, w, h, depth, regionColor) {
    const total = siblings.reduce((s, n) => s + valueOf(n, sizeBy), 0) || 1;
    const horizontal = w >= h;
    let off = horizontal ? x : y;
    for (const n of siblings) {
      const frac = valueOf(n, sizeBy) / total;
      const cw = horizontal ? w * frac : w;
      const ch = horizontal ? h : h * frac;
      const cx = horizontal ? off : x;
      const cy = horizontal ? y : off;
      const color = depth === 0 ? regionColorOf(n) : regionColor;
      const isLeaf = depth >= targetDepth || !(n.children && n.children.length);
      tiles.push({ node: n, x: cx, y: cy, w: cw, h: ch, depth, color, isLeaf });
      if (!isLeaf && cw > 6 && ch > TM_HEADER + 6) {
        place(n.children, cx + TM_PAD, cy + TM_HEADER, cw - 2 * TM_PAD, ch - TM_HEADER - TM_PAD, depth + 1, color);
      }
      off += horizontal ? cw : ch;
    }
  }
  place(roots, 0, 0, TM_W, TM_H, 0, "#888");
  return tiles;
}

function Kpi({ label, value, hint, accent, glyph }) {
  return (
    <div style={{ background: MDB.card, border: `1px solid ${MDB.borderSubtle}`, borderLeft: `3px solid ${accent}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: MDB.faint, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
        {glyph && <Icon glyph={glyph} size="small" fill={accent} />} {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: MDB.forest, lineHeight: 1 }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: MDB.faint, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function BarTooltip({ active, payload, sizeBy }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ background: MDB.white, border: `1px solid ${MDB.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, boxShadow: "0 2px 8px rgba(0,30,43,0.1)" }}>
      <div style={{ color: MDB.text, fontWeight: 600, marginBottom: 2 }}>{p.name}</div>
      <div style={{ color: MDB.muted }}>{sizeBy === "capacity" ? `${p.value.toLocaleString()} kW installed` : `${p.value.toLocaleString()} customers`}</div>
    </div>
  );
}

export default function NetworkTree({ statusById = null }) {
  const { tree, isLoading, error } = useNetworkTree();

  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const dragRef = useRef(null);

  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState("");
  const [utilityId, setUtilityId] = useState("all");
  const [level, setLevel] = useState("transformer");
  const [sizeBy, setSizeBy] = useState("customers");

  const maxDepth = LEVEL_DEPTH[level] ?? 3;
  const activeFilters = (query.trim() ? 1 : 0) + (utilityId !== "all" ? 1 : 0) + (level !== "transformer" ? 1 : 0);

  const scoped = useMemo(
    () => (utilityId === "all" ? tree : tree.filter((u) => u.id === utilityId)),
    [tree, utilityId]
  );
  const regionColorOf = useMemo(() => {
    const idx = new Map(tree.map((u, i) => [u.id, i]));
    return (u) => CAT[(idx.get(u.id) ?? 0) % CAT.length];
  }, [tree]);

  useEffect(() => {
    if (scoped.length) setExpandedIds(new Set(scoped.map((u) => u.id)));
  }, [scoped]);

  const totals = useMemo(() => {
    let substations = 0, feeders = 0, transformers = 0, meters = 0, capacity = 0;
    scoped.forEach((u) => {
      substations += countByType(u, "substation");
      feeders += countByType(u, "feeder");
      transformers += countByType(u, "transformer");
      meters += countMeters(u);
      capacity += capacityOf(u);
    });
    return { utilities: scoped.length, substations, feeders, transformers, meters, capacity };
  }, [scoped]);

  const { nodes, links } = useMemo(() => layoutTree(scoped, expandedIds, maxDepth), [scoped, expandedIds, maxDepth]);
  const tiles = useMemo(() => layoutTreemap(scoped, maxDepth, sizeBy, regionColorOf), [scoped, maxDepth, sizeBy, regionColorOf]);

  const barData = useMemo(
    () =>
      scoped
        .map((u) => ({ id: u.id, name: u.city || u.name, value: valueOf(u, sizeBy) }))
        .sort((a, b) => b.value - a.value),
    [scoped, sizeBy]
  );

  const lowerQuery = query.trim().toLowerCase();
  const matchIds = useMemo(
    () => (lowerQuery ? collectMatches(scoped, lowerQuery, new Set()) : null),
    [lowerQuery, scoped]
  );

  function handleClick(node) {
    setSelected(node.data);
    if (!node.expandable) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(node.data.id)) next.delete(node.data.id);
      else next.add(node.data.id);
      return next;
    });
  }
  function onWheel(e) {
    e.preventDefault();
    setView((v) => ({ ...v, k: Math.min(10, Math.max(0.4, v.k - e.deltaY * 0.003)) }));
  }
  function onMouseDown(e) { dragRef.current = { startX: e.clientX, startY: e.clientY, origX: view.x, origY: view.y }; }
  function onMouseMove(e) {
    if (!dragRef.current) return;
    setView((v) => ({ ...v, x: dragRef.current.origX + (e.clientX - dragRef.current.startX), y: dragRef.current.origY + (e.clientY - dragRef.current.startY) }));
  }
  function onMouseUp() { dragRef.current = null; }

  const selectStyle = { fontSize: 12, padding: "6px 10px", borderRadius: 8, border: `1px solid ${MDB.border}`, background: "#ffffff", color: MDB.text };
  const metricLabel = sizeBy === "capacity" ? "installed capacity" : "customers served";
  const panelHeader = { fontSize: 12, color: MDB.faint, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 };
  const panel = { background: MDB.card, border: `1px solid ${MDB.borderSubtle}`, borderRadius: 12, padding: 14 };

  return (
    <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${MDB.border}`, boxShadow: "0 2px 12px rgba(0,30,43,0.12)", background: MDB.canvas, color: MDB.text }}>
      <style>{`
        .net-btn { background: #ffffff; border: 1px solid ${MDB.border}; color: ${MDB.muted}; border-radius: 8px; padding: 6px 8px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 12px; }
        .net-btn:hover { background: ${MDB.canvas}; }
        .net-seg { border: 1px solid ${MDB.forest}; background: #fff; color: ${MDB.forest}; padding: 5px 12px; cursor: pointer; font-size: 12px; }
        .net-seg--on { background: ${MDB.forest}; color: #fff; font-weight: 600; }
      `}</style>

      {/* ── Dashboard header band (MongoDB slate) ── */}
      <div style={{ background: MDB.slate, padding: "18px 20px", color: MDB.white, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: MDB.spring, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon glyph="Diagram3" fill={MDB.slate} />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>Grid Network Operations</div>
            <div style={{ fontSize: 12, color: MDB.mist, opacity: 0.85 }}>Asset hierarchy, coverage & installed capacity across the service territory</div>
          </div>
        </div>
        <button
          onClick={() => setShowFilters((s) => !s)}
          aria-expanded={showFilters}
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: showFilters ? MDB.spring : "rgba(255,255,255,0.12)", color: showFilters ? MDB.slate : MDB.white }}
        >
          <Icon glyph="Filter" size="small" fill={showFilters ? MDB.slate : MDB.white} />
          Filters{activeFilters ? ` (${activeFilters})` : ""}
          <Icon glyph={showFilters ? "CaretUp" : "CaretDown"} size="small" fill={showFilters ? MDB.slate : MDB.white} />
        </button>
      </div>

      <div style={{ padding: 20 }}>
        {/* Collapsible filter panel */}
        {showFilters && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: 12, marginBottom: 18, background: MDB.card, border: `1px solid ${MDB.borderSubtle}`, borderRadius: 10 }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 8, top: 7, color: MDB.faint }}><Icon glyph="MagnifyingGlass" size="small" /></span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search asset or city" style={{ ...selectStyle, padding: "6px 10px 6px 30px", width: 220 }} />
            </div>
            <label style={{ fontSize: 12, color: MDB.muted, display: "flex", alignItems: "center", gap: 6 }}>
              Utility
              <select value={utilityId} onChange={(e) => setUtilityId(e.target.value)} style={selectStyle}>
                <option value="all">All utilities</option>
                {tree.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: MDB.muted, display: "flex", alignItems: "center", gap: 6 }}>
              Level of detail
              <select value={level} onChange={(e) => setLevel(e.target.value)} style={selectStyle}>
                <option value="substation">Substations</option>
                <option value="feeder">Feeders</option>
                <option value="transformer">Transformers</option>
              </select>
            </label>
            {activeFilters > 0 && (
              <button className="net-btn" onClick={() => { setQuery(""); setUtilityId("all"); setLevel("transformer"); }}>
                <Icon glyph="X" size="small" /> Clear
              </button>
            )}
          </div>
        )}

        {isLoading && <Body style={{ color: MDB.muted }}>Loading network…</Body>}
        {error && <ErrorText>Error: {error}</ErrorText>}

        {!isLoading && !error && (
          <>
            {/* KPI cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 18 }}>
              <Kpi label="Utilities" value={totals.utilities} accent={CAT[0]} glyph="GovernmentBuilding" />
              <Kpi label="Substations" value={totals.substations} accent={TYPE_COLOR.substation} glyph="LightningBolt" />
              <Kpi label="Feeders" value={totals.feeders} accent={TYPE_COLOR.feeder} glyph="Diagram3" />
              <Kpi label="Transformers" value={totals.transformers} accent={TYPE_COLOR.transformer} glyph="Apps" />
              <Kpi label="Customers served" value={totals.meters.toLocaleString()} hint="metered" accent={MDB.forest} glyph="Person" />
              <Kpi label="Installed capacity" value={`${(tot
                als.capacity / 1000).toFixed(1)}k kW`} hint="sum of transformers" accent={MDB.forest} glyph="LightningBolt" />
            </div>

            {/* Row: node-link hierarchy + detail */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 14, marginBottom: 14 }}>
              <div
                style={{ ...panel, position: "relative", padding: 0, overflow: "hidden", height: 440 }}
                onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
              >
                <div style={{ position: "absolute", top: 12, left: 14, ...panelHeader, marginBottom: 0, zIndex: 1 }}>Asset hierarchy</div>
                <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 6, zIndex: 2 }}>
                  <button className="net-btn" onClick={() => setView((v) => ({ ...v, k: Math.min(10, v.k + 0.3) }))} aria-label="Zoom in"><Icon glyph="Plus" size="small" /></button>
                  <button className="net-btn" onClick={() => setView((v) => ({ ...v, k: Math.max(0.4, v.k - 0.3) }))} aria-label="Zoom out"><Icon glyph="Minus" size="small" /></button>
                  <button className="net-btn" onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label="Reset view"><Icon glyph="FullScreenEnter" size="small" /></button>
                </div>
                <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" height="100%" style={{ cursor: dragRef.current ? "grabbing" : "grab" }}>
                  <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
                    {links.map((l) => (
                      <path key={l.key} d={linkPath(l.source, l.target)} fill="none" stroke={MDB.border} strokeWidth={1.25} strokeOpacity={0.9} />
                    ))}
                    {nodes.map((n) => {
                      const dimmed = matchIds && !matchIds.has(n.data.id);
                      // When a live-status map is supplied, drive node color from
                      // status; otherwise fall back to the asset-type green ramp.
                      const status = statusById ? statusById[n.data.id] : null;
                      const color = statusById ? (STATUS_COLOR[status] ?? STATUS_COLOR.unknown) : TYPE_COLOR[n.data.type];
                      const r = NODE_R[n.data.type] ?? 5;
                      const isSel = selected?.id === n.data.id;
                      return (
                        <g key={n.data.id} transform={`translate(${n.x} ${n.y})`} onClick={() => handleClick(n)} style={{ cursor: "pointer", opacity: dimmed ? 0.2 : 1 }}>
                          {n.expandable && <text x={-r - 9} dy={3.5} fontSize={9} fill={MDB.muted} textAnchor="middle">{n.expanded ? "▾" : "▸"}</text>}
                          <circle r={r} fill="#ffffff" stroke={color} strokeWidth={isSel ? 3 : 2} />
                          <circle r={Math.max(r - 2, 1)} fill={color} fillOpacity={0.9} />
                          <text x={r + 6} dy={4} fontSize={12} fill={dimmed ? MDB.faint : MDB.text} fontWeight={isSel ? 700 : 500}>
                            {n.data.type === "utility" ? n.data.city : n.data.name}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                </svg>
                <div style={{ position: "absolute", bottom: 10, left: 14, display: "flex", gap: 14, fontSize: 11, color: MDB.muted, background: "rgba(255,255,255,0.85)", padding: "4px 8px", borderRadius: 6 }}>
                  {Object.entries(statusById ? STATUS_COLOR : TYPE_COLOR).map(([k, c]) => (
                    <span key={k} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }} />
                      {statusById ? STATUS_LABEL[k] : TYPE_LABEL[k]}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ ...panel, height: 440, overflowY: "auto" }}>
                <div style={panelHeader}>Asset detail</div>
                {!selected && <div style={{ fontSize: 12, color: MDB.faint }}>Select an asset in any panel to inspect it.</div>}
                {selected && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <Icon glyph={ICONS[selected.type] || "Diagram"} fill={TYPE_COLOR[selected.type]} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: MDB.text }}>{selected.name}</span>
                    </div>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: MDB.forest, border: `1px solid ${MDB.green}`, borderRadius: 4, padding: "1px 7px", marginBottom: 12, textTransform: "capitalize" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: MDB.spring }} />{selected.status || "active"}
                    </div>
                    {[
                      ["Asset type", TYPE_LABEL[selected.type] || selected.type],
                      ["Service area", selected.city],
                      ["Rated capacity", `${selected.capacityKw?.toLocaleString() ?? "—"} kW`],
                      ["Installed downstream", `${capacityOf(selected).toLocaleString()} kW`],
                      ["Customers served", countMeters(selected).toLocaleString()],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, padding: "5px 0", borderBottom: `1px solid ${MDB.borderSubtle}` }}>
                        <span style={{ color: MDB.faint }}>{k}</span>
                        <span style={{ color: MDB.text, fontWeight: 500, textAlign: "right" }}>{v}</span>
                      </div>
                    ))}
                    {selected.meters && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 10 }}>
                        {selected.meters.length === 0 && <span style={{ fontSize: 11, color: MDB.faint, fontStyle: "italic" }}>No meters mapped</span>}
                        {selected.meters.map((m) => (
                          <span key={m} style={{ fontSize: 10, background: MDB.mist, color: MDB.forest, borderRadius: 6, padding: "2px 6px", display: "flex", alignItems: "center", gap: 3 }}>
                            <Icon glyph="Gauge" size="small" /> {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Metric toggle */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
              <div style={{ display: "inline-flex", borderRadius: 8, overflow: "hidden" }}>
                <button className={`net-seg ${sizeBy === "customers" ? "net-seg--on" : ""}`} onClick={() => setSizeBy("customers")}>Customers</button>
                <button className={`net-seg ${sizeBy === "capacity" ? "net-seg--on" : ""}`} onClick={() => setSizeBy("capacity")}>Capacity</button>
              </div>
            </div>

            {/* Row: treemap + bar chart */}
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14 }}>
              <div style={panel}>
                <div style={panelHeader}>Distribution by {metricLabel} — tile area = {metricLabel}, colored by utility</div>
                <svg viewBox={`0 0 ${TM_W} ${TM_H}`} width="100%" height="300" preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
                  {tiles.map((t) => {
                    const dimmed = matchIds && !matchIds.has(t.node.id);
                    const isSel = selected?.id === t.node.id;
                    const showLabel = t.w > 46 && t.h > (t.isLeaf ? 16 : TM_HEADER);
                    return (
                      <g key={`${t.node.id}-${t.depth}`} onClick={() => setSelected(t.node)} style={{ cursor: "pointer", opacity: dimmed ? 0.25 : 1 }}>
                        <rect x={t.x} y={t.y} width={Math.max(0, t.w)} height={Math.max(0, t.h)} fill={t.color} fillOpacity={t.isLeaf ? 0.85 : 0.12} stroke={isSel ? MDB.text : "#ffffff"} strokeWidth={isSel ? 2 : 1} />
                        {showLabel && (
                          <text x={t.x + 5} y={t.y + (t.isLeaf ? 14 : 11)} fontSize={t.isLeaf ? 11 : 10} fontWeight={t.depth === 0 ? 700 : 500} fill={t.isLeaf ? MDB.slate : MDB.text} style={{ pointerEvents: "none" }}>
                            {(t.node.type === "utility" ? t.node.city : t.node.name).slice(0, Math.floor(t.w / 6.5))}
                            {t.isLeaf && t.w > 90 ? ` · ${valueOf(t.node, sizeBy).toLocaleString()}${sizeBy === "capacity" ? " kW" : ""}` : ""}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div style={panel}>
                <div style={panelHeader}>{sizeBy === "capacity" ? "Installed capacity" : "Customers served"} by utility</div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid horizontal={false} stroke={MDB.borderSubtle} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: MDB.faint }} />
                    <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 11, fill: MDB.muted }} />
                    <Tooltip cursor={{ fill: "rgba(0,104,74,0.06)" }} content={<BarTooltip sizeBy={sizeBy} />} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {barData.map((d) => (
                        <Cell
                          key={d.id}
                          fill={regionColorOf({ id: d.id })}
                          fillOpacity={selected && selected.id !== d.id ? 0.4 : 1}
                          onClick={() => setSelected(scoped.find((u) => u.id === d.id) || null)}
                          style={{ cursor: "pointer" }}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ fontSize: 11, color: MDB.faint, marginTop: 12 }}>
              Open <strong>Filters</strong> to scope by utility, set level of detail, or search. Click any asset — in the hierarchy, treemap, or chart — to inspect it. Toggle <strong>Customers / Capacity</strong> to re-weight the distribution.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
