"use client";

import { useMemo, useState } from "react";
import Icon from "@leafygreen-ui/icon";
import GridMap from "@/components/control-center/GridMap";
import ForecastVsActual from "@/components/control-center/ForecastVsActual";
import { useRegionalForecast } from "@/components/forecasting/useRegionalForecast";
import { useControlCenter } from "@/components/control-center/useControlCenter";
import { useSegmentMix } from "@/components/control-center/useSegmentMix";
import {
  NetworkKpis,
  LiveDemandTile,
  PeakWarnings,
  OutageRisk,
  SubstationHealth,
  CustomersTariffPanel,
  AssetDetail,
} from "@/components/control-center/panels";
import styles from "./control-center.module.css";

export default function ControlCenterPage() {
  const [scope, setScope] = useState("all");
  const [selectedNode, setSelectedNode] = useState(null);

  const { data, isLoading, error, tick } = useControlCenter(scope);
  const { data: mix, isLoading: mixLoading } = useSegmentMix(scope);

  // Drive the reused forecast chart from the substations in view (worst-health
  // first), so "forecast vs actual" tracks the same scope as the rest of the view.
  const forecastIds = useMemo(
    () => (data?.substationHealth ?? []).slice(0, 4).map((s) => s.id),
    [data]
  );
  const forecast = useRegionalForecast("substation", forecastIds);

  const utilities = data?.utilities ?? [];

  // Per-asset live metrics for the grid-map Asset detail panel, keyed by node id.
  const metricsById = useMemo(() => {
    const m = {};
    for (const w of data?.peakWarnings ?? []) {
      m[w.feederId] = { utilizationPct: w.utilizationPct, loadKw: w.loadKw };
    }
    for (const h of data?.substationHealth ?? []) {
      m[h.id] = { ...(m[h.id] || {}), utilizationPct: h.utilizationPct, healthScore: h.healthScore, anomalyCount: h.anomalyCount };
    }
    for (const r of data?.outageRisk ?? []) {
      m[r.id] = { ...(m[r.id] || {}), riskScore: r.riskScore, severity: r.severity };
    }
    return m;
  }, [data]);

  function handleExport() {
    if (!data) return;
    const scopeLabel = scope === "all" ? "All utilities" : utilities.find((u) => u.id === scope)?.name ?? scope;
    const html = buildReportHtml({ scopeLabel, data, mix });
    const win = window.open("", "_blank");
    if (win) {
      // Open a formatted, printable report (Save as PDF from the print dialog).
      win.document.write(html);
      win.document.close();
      win.focus();
      win.print();
    } else {
      // Popups blocked — fall back to downloading the report as an HTML file.
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `control-center-report-${scope}-${Date.now()}.html`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div className={styles.page}>
      {/* ── Header: scope selector, live indicator, export ── */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "#00ed64", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon glyph="Dashboard" fill="#001e2b" />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>Grid Control Center</div>
            <div style={{ fontSize: 12, color: "#e3fcf7", opacity: 0.85 }}>
              Live demand, capacity pressure, outage risk & forecast across the service territory
            </div>
          </div>
        </div>

        <div className={styles.headerActions}>
          <span className={styles.live}>
            <span
              key={tick}
              className={`${styles.liveDot} ${styles.liveDotPulse}`}
            />
            {error ? "Reconnecting…" : "Live · 5s"}
          </span>

          <select
            className={styles.scopeSelect}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            aria-label="Scope"
          >
            <option value="all">All utilities</option>
            {utilities.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>

          <button className={styles.exportBtn} onClick={handleExport}>
            <Icon glyph="Download" size="small" fill="#001e2b" /> Export
          </button>
        </div>
      </div>

      {error && (
        <div style={{ color: "#DB3030", fontSize: 13 }}>Error loading overview: {error}</div>
      )}

      {/* ── Network totals KPI strip ── */}
      <NetworkKpis totals={data?.totals} />

      {/* ── Main row: live demand + peak warnings | grid map | outage risk + health ── */}
      <div className={styles.mainRow}>
        <div className={styles.column}>
          <LiveDemandTile liveDemand={data?.liveDemand} />
          <PeakWarnings warnings={data?.peakWarnings} thresholds={data?.thresholds} grow />
        </div>

        <div className={styles.column}>
          <GridMap
            statusById={data?.statusById ?? null}
            scope={scope}
            selectedId={selectedNode?.id ?? null}
            onSelect={setSelectedNode}
          />
        </div>

        <div className={styles.column}>
          <AssetDetail
            node={selectedNode}
            status={selectedNode ? data?.statusById?.[selectedNode.id] ?? "unknown" : null}
            metrics={selectedNode ? metricsById[selectedNode.id] : null}
          />
          <OutageRisk risk={data?.outageRisk} />
          <SubstationHealth health={data?.substationHealth} grow />
        </div>
      </div>

      {/* ── Bottom row: segment/tariff | forecast vs actual ── */}
      <div className={styles.bottomRow}>
        <CustomersTariffPanel mix={mix} isLoading={mixLoading} />
        <ForecastVsActual
          regions={forecast.regions}
          isLoading={forecast.isLoading}
          isRefreshing={forecast.isRefreshing}
          error={forecast.error}
        />
      </div>

      {isLoading && !data && (
        <div style={{ fontSize: 13, color: "#5c6970" }}>Loading control center…</div>
      )}
    </div>
  );
}

// Builds a self-contained, printable HTML report of the current control-center
// state (Save as PDF from the browser print dialog).
function buildReportHtml({ scopeLabel, data, mix }) {
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const ld = data.liveDemand ?? {};
  const t = data.totals ?? {};

  const table = (headers, rows) => `
    <table>
      <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>`;

  const peak = table(
    ["Feeder", "Substation", "Load (kW)", "Capacity (kW)", "Utilization", "Status"],
    (data.peakWarnings ?? []).map((w) => [w.name, w.substationName, w.loadKw, w.capacityKw ?? "—", `${w.utilizationPct}%`, w.status])
  );
  const health = table(
    ["Substation", "Utility", "Utilization", "Anomalies", "Health", "Status"],
    (data.substationHealth ?? []).map((h) => [h.name, h.utilityName, h.utilizationPct == null ? "—" : `${h.utilizationPct}%`, h.anomalyCount, `${h.healthScore}/100`, h.status])
  );
  const risk = table(
    ["Substation", "Meters out", "Meters", "Anomalies", "Risk", "Severity"],
    (data.outageRisk ?? []).map((r) => [r.name, r.outageMeters, r.meterCount, r.anomalyCount, r.riskScore, r.severity])
  );
  const segs = table(
    ["Segment", "Customers", "Share", "Avg power (W)", "Sample bill/mo"],
    (mix?.segments ?? []).map((s) => [s.label, s.customerCount, `${s.sharePct}%`, Math.round(s.avgPowerW), s.representative?.monthlyTotal != null ? `$${s.representative.monthlyTotal.toFixed(2)}` : "—"])
  );

  return `<!doctype html><html><head><meta charset="utf-8"><title>Grid Control Center Report</title>
    <style>
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #001E2B; margin: 32px; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .5px; color: #00684A; margin: 24px 0 8px; }
      .meta { color: #5C6970; font-size: 12px; margin-bottom: 16px; }
      .kpis { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 8px; }
      .kpi { border-left: 3px solid #00684A; padding: 4px 12px; }
      .kpi .v { font-size: 20px; font-weight: 700; color: #00684A; }
      .kpi .l { font-size: 11px; color: #889397; text-transform: uppercase; }
      table { border-collapse: collapse; width: 100%; font-size: 12px; }
      th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #E8EDEB; }
      th { color: #5C6970; font-weight: 600; }
    </style></head><body>
    <h1>Grid Control Center Report</h1>
    <div class="meta">Scope: <strong>${esc(scopeLabel)}</strong> · Generated ${new Date().toLocaleString()}</div>

    <div class="kpis">
      <div class="kpi"><div class="v">${esc(ld.totalLoadKw?.toLocaleString() ?? "—")} kW</div><div class="l">Live demand${ld.utilizationPct != null ? ` (${ld.utilizationPct}%)` : ""}</div></div>
      <div class="kpi"><div class="v">${esc(t.meters?.toLocaleString() ?? "—")}</div><div class="l">Customers served</div></div>
      <div class="kpi"><div class="v">${mix?.estimatedMonthlyTotal != null ? `$${mix.estimatedMonthlyTotal.toLocaleString()}` : "—"}</div><div class="l">Est. tariff total / mo</div></div>
      <div class="kpi"><div class="v">${esc(t.substations ?? "—")}/${esc(t.feeders ?? "—")}</div><div class="l">Substations / Feeders</div></div>
    </div>

    <h2>Peak load warnings</h2>${peak}
    <h2>Substation health</h2>${health}
    <h2>Outage risk</h2>${risk}
    <h2>Customer segments &amp; tariff</h2>${segs}
    </body></html>`;
}
