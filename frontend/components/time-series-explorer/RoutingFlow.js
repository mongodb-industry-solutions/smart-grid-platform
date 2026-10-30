"use client";

import styles from "@/style/time-series-explorer/routing.module.css";

// Linear view: reads → pipeline stages → produced object. Answers "how is the
// new data object built?" stage by stage.
export default function RoutingFlow({ routing }) {
  const { entities, stages, output } = routing;

  return (
    <div className={styles.flow}>
      {/* Reads */}
      <div className={styles.row} style={{ animationDelay: "0s" }}>
        <span className={styles.rowLabel}>Reads</span>
        <div className={styles.rowBody}>
          {entities.map((e) => (
            <span
              key={e.name}
              className={`${styles.entity} ${
                e.role === "source" ? styles.entitySource : styles.entityJoin
              }`}
            >
              {e.name}
              <em className={styles.entityRole}>
                {e.role === "source" ? "source" : "join"}
              </em>
            </span>
          ))}
        </div>
      </div>

      {/* Pipeline */}
      <div className={styles.row} style={{ animationDelay: "0.12s" }}>
        <span className={styles.rowLabel}>Pipeline</span>
        <div className={styles.rowBody}>
          {stages.map((s, i) => (
            <span key={i} className={styles.stageWrap}>
              {i > 0 && <span className={styles.stageArrow}>→</span>}
              <span className={styles.stage}>
                <span className={styles.stageOp}>{s.op}</span>
                {s.detail && <span className={styles.stageDetail}>{s.detail}</span>}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Produces */}
      <div className={styles.row} style={{ animationDelay: "0.24s" }}>
        <span className={styles.rowLabel}>Produces</span>
        <div className={styles.rowBody}>
          <div className={styles.output}>
            <span className={styles.outputHead}>
              new document
              {output.ready && (
                <span className={styles.outputLive}>
                  {output.fields.length} field{output.fields.length === 1 ? "" : "s"}
                </span>
              )}
            </span>
            <div className={styles.outputFields}>
              {output.fields.length ? (
                output.fields.map((f) => (
                  <span key={f} className={styles.field}>
                    {f}
                  </span>
                ))
              ) : (
                <span className={styles.fieldMuted}>
                  run the pipeline to reveal the output shape
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
