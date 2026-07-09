"use client";

import { useState } from "react";
import AgentGraph from "./AgentGraph";
import VectorMap from "./VectorMap";
import styles from "../../style/ai-chatbot/chat.module.css";

/**
 * Right-side panel with two tabs: the Agent Graph (how the agent reasoned) and
 * the Vector Map (2D projection of the knowledge base + the query).
 */
export default function AssistantPanel({ question, message, isLoading, map, mapLoading, mapError }) {
  const [tab, setTab] = useState("graph");

  return (
    <div className={styles.explorer}>
      <div className={styles.panelTabs}>
        <button
          type="button"
          className={`${styles.panelTab} ${tab === "graph" ? styles.panelTabActive : ""}`}
          onClick={() => setTab("graph")}
        >
          Agent Graph
        </button>
        <button
          type="button"
          className={`${styles.panelTab} ${tab === "map" ? styles.panelTabActive : ""}`}
          onClick={() => setTab("map")}
        >
          Vector Map
        </button>
      </div>

      <div className={styles.panelBody}>
        {tab === "graph" ? (
          <AgentGraph question={question} message={message} isLoading={isLoading} />
        ) : (
          <VectorMap map={map} isLoading={mapLoading} error={mapError} />
        )}
      </div>
    </div>
  );
}
