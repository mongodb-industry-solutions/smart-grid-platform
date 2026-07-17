"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@leafygreen-ui/icon";
import Button from "@leafygreen-ui/button";
import { Select, Option } from "@leafygreen-ui/select";
import { H1, Body } from "@leafygreen-ui/typography";
import GridMap from "@/components/network-center/GridMap";
import ForecastVsActual from "@/components/network-center/ForecastVsActual";
import { useRegionalForecast } from "@/components/forecasting/useRegionalForecast";
import { useNetworkCenter } from "@/components/network-center/useNetworkCenter";
import { useSegmentMix } from "@/components/network-center/useSegmentMix";
import {
  NetworkKpis,
  LiveDemandTile,
  PeakWarnings,
  OutageRisk,
  SubstationHealth,
  CustomersTariffPanel,
  AssetDetail,
} from "@/components/network-center/panels";
import styles from "@/style/network-center/network-center.module.css";

export default function NetworkCenterPage() {
  const [scope, setScope] = useState("all");
  const [selectedNode, setSelectedNode] = useState(null);

  // Cap the side columns to the center column (map + tariff) height, so their
  // lists scroll instead of growing taller than where the tariff card ends.
  const centerRef = useRef(null);
  const [centerH, setCenterH] = useState(null);
  useEffect(() => {
    const el = centerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setCenterH(Math.round(entry.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const sideStyle = centerH ? { height: centerH, overflow: "hidden" } : undefined;

  const { data, isLoading, error, tick } = useNetworkCenter(scope);
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
      a.download = `network-center-report-${scope}-${Date.now()}.html`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div className={styles.page}>
      {/* ── Header: title, scope filter, live indicator, export ── */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <H1 className={styles.headerHeading}>Grid Network Center</H1>
          <Body className={styles.headerSubtitle}>
            Live demand, capacity pressure, outage status &amp; forecast across the service territory
          </Body>
        </div>

        <div className={styles.headerActions}>
          <span className={`${styles.liveBadge} ${error ? styles.liveBadgeError : ""}`}>
            <span key={tick} className={styles.liveDot} />
            {error ? "RECONNECTING" : "LIVE · 2s"}
          </span>

          <Select
            aria-label="Scope"
            value={scope}
            onChange={setScope}
            size="small"
            allowDeselect={false}
            className={styles.scopeSelect}
          >
            <Option value="all">All utilities</Option>
            {utilities.map((u) => (
              <Option key={u.id} value={u.id}>{u.name}</Option>
            ))}
          </Select>

          <Button size="small" leftGlyph={<Icon glyph="Download" />} onClick={handleExport}>
            Export
          </Button>
        </div>
      </div>

      {error && (
        <Body className={styles.errorText}>Error loading overview: {error}</Body>
      )}

      {/* ── Network totals KPI strip ── */}
      <NetworkKpis totals={data?.totals} />

      {/* ── Main row: live demand + peak warnings | grid map | outage status + health ── */}
      <div className={styles.mainRow}>
        <div className={styles.column} style={sideStyle}>
          <LiveDemandTile liveDemand={data?.liveDemand} />
          <PeakWarnings warnings={data?.peakWarnings} thresholds={data?.thresholds} grow />
        </div>

        <div className={styles.column} ref={centerRef}>
          <GridMap
            statusById={data?.statusById ?? null}
            loadById={data?.loadById ?? null}
            totals={data?.totals ?? null}
            scope={scope}
            selectedId={selectedNode?.id ?? null}
            onSelect={setSelectedNode}
          />
          <CustomersTariffPanel mix={mix} isLoading={mixLoading} />
        </div>

        <div className={styles.column} style={sideStyle}>
          <AssetDetail
            node={selectedNode}
            status={selectedNode ? data?.statusById?.[selectedNode.id] ?? "unknown" : null}
            metrics={selectedNode ? metricsById[selectedNode.id] : null}
          />
          <OutageRisk risk={data?.outageRisk} />
          <SubstationHealth health={data?.substationHealth} grow />
        </div>
      </div>

      {/* ── Forecast: full width ── */}
      <ForecastVsActual
        regions={forecast.regions}
        isLoading={forecast.isLoading}
        isRefreshing={forecast.isRefreshing}
        error={forecast.error}
      />

      {isLoading && !data && (
        <div style={{ fontSize: 13, color: "#5c6970" }}>Loading control center…</div>
      )}
    </div>
  );
}

// Builds a self-contained, printable HTML report of the current network-center
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

  return `<!doctype html><html><head><meta charset="utf-8"><title>Grid Network Center Report</title>
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
    <h1>Grid Network Center Report</h1>
    <div class="meta">Scope: <strong>${esc(scopeLabel)}</strong> · Generated ${new Date().toLocaleString()}</div>

    <div class="kpis">
      <div class="kpi"><div class="v">${esc(ld.totalLoadKw?.toLocaleString() ?? "—")} kW</div><div class="l">Live demand${ld.utilizationPct != null ? ` (${ld.utilizationPct}%)` : ""}</div></div>
      <div class="kpi"><div class="v">${esc(t.meters?.toLocaleString() ?? "—")}</div><div class="l">Customers served</div></div>
      <div class="kpi"><div class="v">${mix?.estimatedMonthlyTotal != null ? `$${mix.estimatedMonthlyTotal.toLocaleString()}` : "—"}</div><div class="l">Est. tariff total / mo</div></div>
      <div class="kpi"><div class="v">${esc(t.substations ?? "—")}/${esc(t.feeders ?? "—")}</div><div class="l">Substations / Feeders</div></div>
    </div>

    <h2>Peak load warnings</h2>${peak}
    <h2>Substation health</h2>${health}
    <h2>Outage Status</h2>${risk}
    <h2>Customer segments &amp; tariff</h2>${segs}
    </body></html>`;
}
