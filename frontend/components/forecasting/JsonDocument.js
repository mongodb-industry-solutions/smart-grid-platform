"use client";

import { useMemo } from "react";
import styles from "../../style/forecasting/document-showcase.module.css";

// Tokenizes one JSON line into keys, strings, numbers and literals.
const TOKEN_RE =
  /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)|(true|false|null)/g;

function highlight(line) {
  const out = [];
  let last = 0;
  let key = 0;
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    if (m[1] !== undefined) {
      if (m[2] !== undefined) {
        out.push(
          <span key={key++} className={styles.jsonKey}>
            {m[1]}
          </span>
        );
        out.push(
          <span key={key++} className={styles.jsonPunct}>
            {m[2]}
          </span>
        );
      } else {
        out.push(
          <span key={key++} className={styles.jsonString}>
            {m[1]}
          </span>
        );
      }
    } else if (m[3] !== undefined) {
      out.push(
        <span key={key++} className={styles.jsonNumber}>
          {m[3]}
        </span>
      );
    } else if (m[4] !== undefined) {
      out.push(
        <span key={key++} className={styles.jsonLiteral}>
          {m[4]}
        </span>
      );
    }
    last = TOKEN_RE.lastIndex;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

/** Renders any value as pretty, syntax-highlighted JSON. */
export default function JsonDocument({ document }) {
  const lines = useMemo(
    () => JSON.stringify(document, null, 2).split("\n"),
    [document]
  );

  return (
    <pre className={styles.json}>
      {lines.map((line, i) => (
        <div key={i} className={styles.jsonLine}>
          {highlight(line)}
        </div>
      ))}
    </pre>
  );
}
