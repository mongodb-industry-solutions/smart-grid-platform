"use client";

import Icon from "@leafygreen-ui/icon";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, Tooltip } from "recharts";
import { AXIS_TICK, TOOLTIP_CONTENT, TOOLTIP_LABEL } from "@/lib/const/chartConfig";
import styles from "@/app/control-center/control-center.module.css";

// Green-forward categorical palette, matching the grid-network charts.
const CAT = ["#00684A", "#00A35C", "#00ED64", "#0498EC", "#FFC010", "#016BF8", "#B45AF2"];

// Shared status → color mapping (mirrors the grid map's live-status ramp).
const STATUS_COLOR = { normal: "#00A35C", warning: "#D97706", critical: "#DB3030", unknown: "#C1C7C6" };
const STATUS_LABEL = { normal: "Normal", warning: "Warning", critical: "Critical", unknown: "No data" };
const SEVERITY_COLOR = { low: "#00A35C", medium: "#D97706", high: "#DB3030" };
const TYPE_LABEL = { substation: "Substation", feeder: "Feeder" };
const TYPE_GLYPH = { substation: "LightningBolt", feeder: "Diagram3" };

/** Asset detail for the node selected on the grid map. */
export function AssetDetail({ node, status, metrics }) {
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.unknown;
  const rows = [];
  if (node) {
    rows.push(["Asset type", TYPE_LABEL[node.type] ?? node.type]);
    rows.push(["Rated capacity", node.capacityKw ? `${node.capacityKw.toLocaleString()} kW` : "—"]);
    rows.push(["Customers served", (node.meterCount ?? 0).toLocaleString()]);
    if (metrics) {
      if (metrics.utilizationPct != null) rows.push(["Utilization", `${metrics.utilizationPct}%`]);
      if (metrics.loadKw != null) rows.push(["Current load", `${metrics.loadKw.toLocaleString()} kW`]);
      if (metrics.healthScore != null) rows.push(["Health score", `${metrics.healthScore}/100`]);
      if (metrics.anomalyCount != null) rows.push(["Anomalies", metrics.anomalyCount]);
      if (metrics.riskScore != null) rows.push(["Outage risk", `${metrics.riskScore} (${metrics.severity})`]);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Asset detail</div>
      {!node ? (
        <div className={styles.empty}>Select a substation or feeder on the map to inspect it.</div>
      ) : (
        <>
          <div className={styles.assetHead}>
            <Icon glyph={TYPE_GLYPH[node.type] ?? "Diagram3"} fill={color} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#001E2B" }}>{node.name}</span>
            <span className={styles.assetStatus} style={{ color, borderColor: color }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
              {STATUS_LABEL[status] ?? "No data"}
            </span>
          </div>
          {rows.map(([k, v]) => (
            <div key={k} className={styles.assetRow}>
              <span style={{ color: "#889397" }}>{k}</span>
              <span style={{ color: "#001E2B", fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function fmtKw(n) {
  if (n == null) return "—";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k kW` : `${Math.round(n)} kW`;
}

/** Scoped network totals — mirrors the grid-network KPI strip, in our style. */
export function NetworkKpis({ totals }) {
  const t = totals ?? {};
  const cards = [
    { label: "Utilities", value: t.utilities ?? "—", accent: "#00684A", glyph: "GovernmentBuilding" },
    { label: "Substations", value: t.substations ?? "—", accent: "#00684A", glyph: "LightningBolt" },
    { label: "Feeders", value: t.feeders ?? "—", accent: "#00A35C", glyph: "Diagram3" },
    { label: "Transformers", value: t.transformers ?? "—", accent: "#00ED64", glyph: "Apps" },
    { label: "Customers served", value: (t.meters ?? 0).toLocaleString(), hint: "metered", accent: "#00684A", glyph: "Person" },
    { label: "Installed capacity", value: `${((t.capacity ?? 0) / 1000).toFixed(1)}k kW`, hint: "sum of transformers", accent: "#00684A", glyph: "LightningBolt" },
  ];
  return (
    <div className={styles.kpiRow}>
      {cards.map((c) => (
        <div key={c.label} className={styles.kpiCard} style={{ borderLeft: `3px solid ${c.accent}` }}>
          <div className={styles.kpiLabel}>
            <Icon glyph={c.glyph} size="small" fill={c.accent} /> {c.label}
          </div>
          <div className={styles.kpiCardValue}>{c.value}</div>
          {c.hint && <div className={styles.kpiHint}>{c.hint}</div>}
        </div>
      ))}
    </div>
  );
}

/** Live aggregate demand vs capacity for the current scope. */
export function LiveDemandTile({ liveDemand }) {
  const pct = liveDemand?.utilizationPct ?? null;
  const color = pct == null ? "#00684A" : STATUS_COLOR[
    pct >= 95 ? "critical" : pct >= 85 ? "warning" : "normal"
  ];
  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Live demand</div>
      <div className={styles.kpiValue}>{fmtKw(liveDemand?.totalLoadKw)}</div>
      <div className={styles.kpiSub}>
        {pct == null ? "capacity unknown" : `${pct}% of ${fmtKw(liveDemand?.totalCapacityKw)} capacity`}
        {liveDemand?.feederCount ? ` · ${liveDemand.feederCount} feeders` : ""}
      </div>
      <div className={styles.meterTrack}>
        <div
          className={styles.meterFill}
          style={{ width: `${Math.min(100, pct ?? 0)}%`, background: color }}
        />
      </div>
    </div>
  );
}

/** Feeders flagged by load / capacity — name + colored %, worst first. */
export function PeakWarnings({ warnings, thresholds, grow }) {
  const flagged = (warnings ?? []).filter((w) => w.status !== "normal");
  return (
    <div className={`${styles.card} ${grow ? styles.grow : ""}`}>
      <div className={styles.cardTitle}>Peak load warnings</div>
      <div className={styles.kpiSub}>
        {flagged.length} feeders ≥ {thresholds?.warning ?? 85}% capacity
      </div>
      <div className={styles.list}>
        {(warnings ?? []).length === 0 && <div className={styles.empty}>No feeder data.</div>}
        {(warnings ?? []).slice(0, 20).map((w) => (
          <div key={w.feederId} className={styles.statusRow}>
            <div className={styles.rowName}>
              {w.name}
              <div className={styles.rowSub}>{w.substationName}</div>
            </div>
            <span style={{ color: STATUS_COLOR[w.status], fontWeight: 700, fontSize: 14 }}>
              {w.utilizationPct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Per-substation outage/anomaly risk as a horizontal bar chart. Horizontal so
 *  long substation names sit on the axis and never clip, however many show. */
export function OutageRisk({ risk, grow }) {
  const data = (risk ?? []).slice(0, 8).map((r) => ({
    name: r.name.replace(/ Substation$/, ""),
    riskScore: r.riskScore,
    severity: r.severity,
    outageMeters: r.outageMeters,
    meterCount: r.meterCount,
    anomalyCount: r.anomalyCount,
  }));

  const height = Math.max(140, data.length * 30 + 24);

  return (
    <div className={`${styles.card} ${grow ? styles.grow : ""}`}>
      <div className={styles.cardTitle}>Outage risk</div>
      {data.length === 0 ? (
        <div className={styles.empty}>No substation data.</div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
            <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "#e8edeb" }} />
            <YAxis type="category" dataKey="name" width={104} tick={{ ...AXIS_TICK, fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: "rgba(0,104,74,0.06)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload;
                return (
                  <div style={TOOLTIP_CONTENT}>
                    <div style={{ ...TOOLTIP_LABEL, marginBottom: 2 }}>{p.name}</div>
                    <div style={{ color: SEVERITY_COLOR[p.severity], fontWeight: 600 }}>Risk {p.riskScore}</div>
                    <div style={{ color: "#889397" }}>{p.outageMeters}/{p.meterCount} out · {p.anomalyCount} anomalies</div>
                  </div>
                );
              }}
            />
            <Bar dataKey="riskScore" radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={14}>
              {data.map((d) => (
                <Cell key={d.name} fill={SEVERITY_COLOR[d.severity]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/** Single health status per substation as a simple colored list. */
export function SubstationHealth({ health, grow }) {
  const statusFor = (h) =>
    h.status && h.status !== "unknown"
      ? h.status
      : h.healthScore >= 80
      ? "normal"
      : h.healthScore >= 60
      ? "warning"
      : "critical";
  return (
    <div className={`${styles.card} ${grow ? styles.grow : ""}`}>
      <div className={styles.cardTitle}>Substation health</div>
      <div className={styles.list}>
        {(health ?? []).length === 0 && <div className={styles.empty}>No substation data.</div>}
        {(health ?? []).map((h) => {
          const status = statusFor(h);
          return (
            <div key={h.id} className={styles.statusRow}>
              <div className={styles.rowName}>
                {h.name.replace(/ Substation$/, "")}
                <div className={styles.rowSub}>
                  {h.utilizationPct == null ? "util n/a" : `${h.utilizationPct}% load`} · {h.anomalyCount} anomalies
                </div>
              </div>
              <span style={{ color: STATUS_COLOR[status], fontWeight: 600 }}>{STATUS_LABEL[status]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Customers served + estimated total monthly tariff revenue for the scope. */
export function CustomersTariffPanel({ mix, isLoading }) {
  const customers = mix?.customersServed ?? null;
  const total = mix?.estimatedMonthlyTotal ?? null;
  const fmtMoney = (n) =>
    n == null
      ? "—"
      : n >= 1000
      ? `$${(n / 1000).toFixed(1)}k`
      : `$${n.toFixed(0)}`;

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Customers &amp; tariff</div>

      {isLoading && customers == null ? (
        <div className={styles.empty}>Loading…</div>
      ) : (
        <>
          <div className={styles.statTiles}>
            <div className={styles.statTile}>
              <div className={styles.kpiValue}>{customers?.toLocaleString() ?? "—"}</div>
              <div className={styles.kpiSub}>Customers served</div>
            </div>
            <div className={styles.statTile}>
              <div className={styles.kpiValue}>{fmtMoney(total)}</div>
              <div className={styles.kpiSub}>Est. tariff total / mo</div>
            </div>
          </div>

          <CustomersByUtilityChart byUtility={mix?.byUtility ?? []} />
        </>
      )}
    </div>
  );
}

/** Customers served by utility — horizontal bars, matching the grid-network chart. */
function CustomersByUtilityChart({ byUtility }) {
  const data = byUtility.map((u) => ({
    id: u.id,
    name: u.name.replace(/ Utility$/, ""),
    customers: u.customers,
  }));
  if (data.length === 0) return null;

  return (
    <div>
      <div className={styles.rowSub} style={{ marginBottom: 4 }}>Customers served by utility</div>
      <ResponsiveContainer width="100%" height={Math.max(120, data.length * 28 + 16)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="#E8EDEB" />
          <XAxis type="number" tick={{ ...AXIS_TICK, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={92} tick={{ ...AXIS_TICK, fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(0,104,74,0.06)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload;
              return (
                <div style={TOOLTIP_CONTENT}>
                  <div style={{ ...TOOLTIP_LABEL, marginBottom: 2 }}>{p.name}</div>
                  <div style={{ color: "#5C6970" }}>{p.customers.toLocaleString()} customers</div>
                </div>
              );
            }}
          />
          <Bar dataKey="customers" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={d.id} fill={CAT[i % CAT.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
