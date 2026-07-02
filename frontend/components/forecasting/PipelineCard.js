"use client";

import { Body } from "@leafygreen-ui/typography";
import JsonDocument from "./JsonDocument";
import styles from "../../style/forecasting/document-showcase.module.css";

/**
 * The aggregation pipeline that powers the demand chart, as readable JSON. Built
 * client-side from the current filters, so it updates instantly (no dimming).
 */
export default function PipelineCard({ pipeline }) {
  const body =
    !pipeline || pipeline.length === 0 ? (
      <Body>Select filters to build the aggregation.</Body>
    ) : (
      <JsonDocument document={pipeline} />
    );

  return (
    <div className={styles.pipelineSection}>
      <div className={styles.pipelineHeader}>
        <span className={styles.showcaseTitle}>Aggregation Pipeline</span>
        <span className={styles.badge}>db.meter_network_map.aggregate()</span>
      </div>

      <div className={styles.jsonWrap}>{body}</div>

      <p className={styles.explainer}>
        The pipeline builds up as you drill down: each filter adds a readable
        <span className={styles.inlineAccent}> $match </span>
        that narrows the scope (region → feeder → meter). Then
        <span className={styles.inlineAccent}> $lookup </span>
        pulls each meter&apos;s readings and
        <span className={styles.inlineAccent}> $group </span>
        computes expected demand per region per hour — one query, no rigid joins.
      </p>
    </div>
  );
}
