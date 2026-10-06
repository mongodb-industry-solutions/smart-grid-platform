"use client";

import { useMemo } from "react";
import styles from "@/style/time-series-explorer/pipeline-viewer.module.css";

// Stage operators that get the green "stage" highlight
const STAGE_RE = /^\s*\{\s*"\$[a-zA-Z]+"/;

// Known context fields that get special highlighting in results
const CTX_FIELDS = new Set([
  "feeder_id",
  "substation_id",
  "utility_id",
  "state",
  "dataid",
  "capacity_kw",
  "grid_position",
]);

function highlightJSON(json) {
  return json.replace(
    /"([^"]+)":/g,
    (match, key) =>
      `<span class="${styles.key}${CTX_FIELDS.has(key) ? ` ${styles.ctx}` : ""}">"${key}"</span>:`
  );
}

function formatPipeline(pipeline) {
  return JSON.stringify(pipeline, null, 2);
}

function diffLines(currentText, prevText) {
  if (!prevText) return new Set();
  const prevSet = new Set(
    prevText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
  );
  const newLineIndices = new Set();
  currentText.split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed && !prevSet.has(trimmed)) {
      newLineIndices.add(i);
    }
  });
  return newLineIndices;
}

export default function PipelineViewer({
  pipeline,
  prevPipeline,
  collection,
  result,
  isLoading,
  error,
  onRun,
}) {
  const pipelineText = useMemo(() => formatPipeline(pipeline), [pipeline]);
  const prevText = useMemo(
    () => (prevPipeline ? formatPipeline(prevPipeline) : null),
    [prevPipeline]
  );
  const newLines = useMemo(
    () => diffLines(pipelineText, prevText),
    [pipelineText, prevText]
  );

  const lines = pipelineText.split("\n");

  return (
    <div className={styles.container}>
      {/* Left pane: pipeline */}
      <div className={styles.pane}>
        <div className={styles.bar}>
          <span className={styles.title}>Pipeline</span>
          <span className={styles.note}>db.{collection}</span>
          <span className={styles.spacer} />
          {prevText && (
            <span className={styles.legend}>
              <i className={styles.legendIcon} />
              new since the previous step
            </span>
          )}
          <button className={styles.runBtn} onClick={onRun} disabled={isLoading}>
            {isLoading ? "Running\u2026" : "Run"}
          </button>
        </div>
        <div className={styles.codeBody}>
          <pre className={styles.code}>
            {lines.map((line, i) => {
              const isNew = newLines.has(i);
              const isStage = STAGE_RE.test(line);
              return (
                <span
                  key={i}
                  className={`${styles.ln}${isNew ? ` ${styles.add}` : ""}${isStage ? ` ${styles.stage}` : ""}`}
                  dangerouslySetInnerHTML={{
                    __html: highlightJSON(escapeHtml(line)) || " ",
                  }}
                />
              );
            })}
          </pre>
        </div>
      </div>

      {/* Right pane: result */}
      <div className={styles.pane}>
        <div className={styles.bar}>
          <span className={styles.title}>Result</span>
          {result && (
            <span className={styles.note}>
              {result.length} document{result.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className={styles.resultBody}>
          {error && <div className={styles.error}>{error}</div>}
          {!result && !error && !isLoading && (
            <div className={styles.hint}>Click Run to execute the pipeline.</div>
          )}
          {isLoading && <div className={styles.hint}>Running pipeline&hellip;</div>}
          {result && !error && (
            <pre
              className={styles.resultJson}
              dangerouslySetInnerHTML={{
                __html: highlightJSON(
                  escapeHtml(JSON.stringify(result, null, 2))
                ),
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
