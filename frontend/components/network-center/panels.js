"use client";

import Icon from "@leafygreen-ui/icon";
import Badge from "@leafygreen-ui/badge";
import { Body } from "@leafygreen-ui/typography";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, Tooltip } from "recharts";
import { AXIS_TICK, TOOLTIP_CONTENT, TOOLTIP_LABEL } from "@/lib/const/chartConfig";
import ShowDocButton from "@/components/customers/ShowDocButton";
import styles from "@/style/network-center/network-center.module.css";

// Live-status ramp — same tokens the grid map and overview use.
const STATUS_COLOR = { normal: "#00A35C", warning: "#D97706", critical: "#DB3030", unknown: "#C1C7C6" };
const STATUS_LABEL = { normal: "Normal", warning: "Warning", critical: "Critical", unknown: "No data" };
const STATUS_VARIANT = { normal: "green", warning: "yellow", critical: "red", unknown: "lightgray" };
const SEVERITY_COLOR = { low: "#00A35C", medium: "#D97706", high: "#DB3030" };
const TYPE_LABEL = { utility: "Utility", substation: "Substation", feeder: "Feeder", transformer: "Transformer" };
const TYPE_GLYPH = { utility: "GovernmentBuilding", substation: "LightningBolt", feeder: "Diagram3", transformer: "Apps" };

/**
 * Standard panel wrapper matching the customers view: a bordered `.card` box
 * with an in-card `.cardTitle` header row and a padded `.cardBody`.
 */
export function Panel({ title, right, children, grow, bodyClassName }) {
  return (
    <div className={`${styles.card} ${grow ? styles.grow : ""}`}>
      <div className={styles.cardTitle}>
        <span>{title}</span>
        {right}
      </div>
      <div className={`${styles.cardBody} ${bodyClassName || ""}`}>{children}</div>
    </div>
  );
}

function fmtKw(n) {
  if (n == null) return "—";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k kW` : `${Math.round(n)} kW`;
}

/** Scoped network totals — a compact KPI strip in the customers metric-tile style. */
export function NetworkKpis({ totals }) {
  const t = totals ?? {};
  const cards = [
    { label: "Utilities", value: t.utilities ?? "—" },
    { label: "Substations", value: t.substations ?? "—" },
    { label: "Feeders", value: t.feeders ?? "—" },
    { label: "Transformers", value: t.transformers ?? "—" },
    { label: "Customers served", value: (t.meters ?? 0).toLocaleString(), hint: "metered" },
    { label: "Installed capacity", value: `${((t.capacity ?? 0) / 1000).toFixed(1)}k kW`, hint: "sum of transformers" },
  ];
  return (
    <div className={styles.kpiRow}>
      {cards.map((c) => (
        <div key={c.label} className={styles.kpiCard}>
          <div className={styles.kpiLabel}>{c.label}</div>
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
  const statusKey = pct == null ? "normal" : pct >= 95 ? "critical" : pct >= 85 ? "warning" : "normal";
  return (
    <Panel
      title="Live Demand"
      right={<ShowDocButton scope="network" component="stability" inline />}
    >
      <div className={styles.kpiValue}>{fmtKw(liveDemand?.totalLoadKw)}</div>
      <Body className={styles.muted}>
        {pct == null ? "capacity unknown" : `${pct}% of ${fmtKw(liveDemand?.totalCapacityKw)} capacity`}
        {liveDemand?.feederCount ? ` · ${liveDemand.feederCount} feeders` : ""}
      </Body>
      <div className={styles.meterTrack}>
        <div className={styles.meterFill} style={{ width: `${Math.min(100, pct ?? 0)}%`, background: STATUS_COLOR[statusKey] }} />
      </div>
    </Panel>
  );
}

/** Feeders flagged by load / capacity — name + status badge, worst first. */
export function PeakWarnings({ warnings, thresholds, grow }) {
  const flagged = (warnings ?? []).filter((w) => w.status !== "normal");
  return (
    <Panel
      title="Peak Load Warnings"
      grow={grow}
      right={<Badge variant={flagged.length ? "yellow" : "green"}>{flagged.length} flagged</Badge>}
    >
      <Body className={styles.muted} style={{ marginBottom: 4 }}>
        ≥ {thresholds?.warning ?? 85}% of capacity
      </Body>
      <div className={styles.list}>
        {(warnings ?? []).length === 0 && <Body className={styles.muted}>No feeder data.</Body>}
        {(warnings ?? []).slice(0, 20).map((w) => (
          <div key={w.feederId} className={styles.statusRow}>
            <div className={styles.rowName}>
              {w.name}
              <div className={styles.rowSub}>{w.substationName}</div>
            </div>
            <Badge variant={STATUS_VARIANT[w.status]}>{w.utilizationPct}%</Badge>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Per-substation outage/anomaly risk as a horizontal bar chart. */
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
    <Panel title="Outage Risk" grow={grow}>
      {data.length === 0 ? (
        <Body className={styles.muted}>No substation data.</Body>
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
    </Panel>
  );
}

/** Single health status per substation as a simple list with status badges. */
export function SubstationHealth({ health, grow }) {
  const statusFor = (h) =>
    h.status && h.status !== "unknown" ? h.status : h.healthScore >= 80 ? "normal" : h.healthScore >= 60 ? "warning" : "critical";
  return (
    <Panel
      title="Substation Health"
      grow={grow}
      right={<ShowDocButton scope="network" component="health" inline />}
    >
      <div className={styles.list}>
        {(health ?? []).length === 0 && <Body className={styles.muted}>No substation data.</Body>}
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
              <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/** Customers served + estimated tariff total, plus customers-by-utility chart. */
export function CustomersTariffPanel({ mix, isLoading, grow }) {
  const customers = mix?.customersServed ?? null;
  const total = mix?.estimatedMonthlyTotal ?? null;
  const fmtMoney = (n) => (n == null ? "—" : n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`);

  return (
    <Panel title="Customers & Tariff" grow={grow}>
      {isLoading && customers == null ? (
        <Body className={styles.muted}>Loading…</Body>
      ) : (
        <>
          <div className={styles.statTiles}>
            <div className={styles.statTile}>
              <div className={styles.kpiValue}>{customers?.toLocaleString() ?? "—"}</div>
              <Body className={styles.muted}>Customers served</Body>
            </div>
            <div className={styles.statTile}>
              <div className={styles.kpiValue}>{fmtMoney(total)}</div>
              <Body className={styles.muted}>Est. tariff total / mo</Body>
            </div>
          </div>
          <CustomersByUtilityChart byUtility={mix?.byUtility ?? []} />
        </>
      )}
    </Panel>
  );
}

// Green-forward categorical palette for the customers-by-utility bars.
const CAT = ["#00684A", "#00A35C", "#00ED64", "#0498EC", "#FFC010", "#016BF8", "#B45AF2"];

function CustomersByUtilityChart({ byUtility }) {
  const data = byUtility.map((u) => ({ id: u.id, name: u.name.replace(/ Utility$/, ""), customers: u.customers }));
  if (data.length === 0) return null;

  return (
    <div>
      <div className={styles.rowSub} style={{ marginBottom: 4 }}>Customers Served by Utility</div>
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

/** Asset detail for the node selected on the grid map. */
export function AssetDetail({ node, status, metrics, grow }) {
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
    <Panel
      title="Asset Detail"
      grow={grow}
      right={node ? <Badge variant={STATUS_VARIANT[status] ?? "lightgray"}>{STATUS_LABEL[status] ?? "No data"}</Badge> : null}
    >
      {!node ? (
        <Body className={styles.muted}>Select a substation or feeder on the map to inspect it.</Body>
      ) : (
        <>
          <div className={styles.assetHead}>
            <Icon glyph={TYPE_GLYPH[node.type] ?? "Diagram3"} fill={color} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "#001E2B" }}>{node.name}</span>
          </div>
          {rows.map(([k, v]) => (
            <div key={k} className={styles.assetRow}>
              <span style={{ color: "#889397" }}>{k}</span>
              <span style={{ color: "#001E2B", fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </>
      )}
    </Panel>
  );
}
