"use client";

import { useMemo, useState } from "react";
import RoutingFlow from "./RoutingFlow";
import RoutingGraph from "./RoutingGraph";
import { buildRouting } from "@/lib/timeSeriesRouting";
import styles from "@/style/time-series-explorer/routing.module.css";

// Wraps the two query-routing views behind a Flow/Graph toggle.
export default function QueryRouting({ step, result }) {
  const [view, setView] = useState("flow");
  const routing = useMemo(() => buildRouting(step, result), [step, result]);

  return (
    <div className={styles.panel}>
      <div className={styles.panelBar}>
        <span className={styles.panelTitle}>Query routing</span>
        <div className={styles.segmented} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === "flow"}
            className={`${styles.segBtn} ${view === "flow" ? styles.segActive : ""}`}
            onClick={() => setView("flow")}
          >
            Flow
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "graph"}
            className={`${styles.segBtn} ${view === "graph" ? styles.segActive : ""}`}
            onClick={() => setView("graph")}
          >
            Graph
          </button>
        </div>
      </div>

      {view === "flow" ? (
        <RoutingFlow routing={routing} />
      ) : (
        <RoutingGraph routing={routing} />
      )}
    </div>
  );
}
