"use client";

import { useMemo } from "react";
import { Body } from "@leafygreen-ui/typography";
import styles from "../../style/ai-chatbot/chat.module.css";

const CAT_COLORS = {
  Glossary: "#016bf8",
  Billing: "#00a35c",
  Tariffs: "#b45af2",
  Concepts: "#d97706",
  Tips: "#0498ec",
  Operations: "#db3030",
};
const catColor = (c) => CAT_COLORS[c] ?? "#889397";

const N = 8; // nearest articles to connect
const W = 300;
const H = 260;
const CX = W / 2;
const CY = H / 2;
const MAX_R = 108;
const MIN_R = 46;

/**
 * Similarity graph: the query sits at the center; the nearest knowledge-base
 * articles connect to it. Closer node + thicker line = more similar (cosine).
 */
export default function VectorMap({ map, isLoading, error }) {
  const articles = map?.articles ?? [];

  const nodes = useMemo(() => {
    const top = articles.slice(0, N);
    if (!top.length) return [];
    const sims = top.map((a) => a.similarity);
    const min = Math.min(...sims);
    const max = Math.max(...sims);
    const norm = (s) => (max > min ? (s - min) / (max - min) : 1);
    return top.map((a, i) => {
      const ang = ((-90 + i * (360 / top.length)) * Math.PI) / 180;
      const nrm = norm(a.similarity);
      const r = MAX_R - nrm * (MAX_R - MIN_R);
      return { ...a, nrm, rank: i + 1, x: CX + r * Math.cos(ang), y: CY + r * Math.sin(ang) };
    });
  }, [articles]);

  if (error) {
    return (
      <div className={styles.explorerEmpty}>
        <Body>
          Vector graph unavailable — it needs a Voyage AI API key (the current key
          is a MongoDB Atlas key). Search still works via Atlas automated
          embedding.
        </Body>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className={styles.explorerEmpty}>
        <Body>
          {isLoading
            ? "Computing similarities…"
            : "Ask a question to see how each knowledge-base article connects to it."}
        </Body>
      </div>
    );
  }

  return (
    <div className={styles.graphWrap}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.simSvg}>
        {/* edges */}
        {nodes.map((n) => (
          <line
            key={`e-${n.slug}`}
            x1={CX}
            y1={CY}
            x2={n.x}
            y2={n.y}
            stroke={catColor(n.category)}
            strokeWidth={1 + n.nrm * 5}
            strokeOpacity={0.25 + n.nrm * 0.55}
            strokeLinecap="round"
          />
        ))}
        {/* nodes */}
        {nodes.map((n) => (
          <g key={n.slug}>
            <circle
              cx={n.x}
              cy={n.y}
              r={n.retrieved ? 12 : 10}
              fill={catColor(n.category)}
              stroke={n.retrieved ? "#001e2b" : "#ffffff"}
              strokeWidth={n.retrieved ? 2.5 : 1}
            >
              <title>{`${n.title} — similarity ${n.similarity}${n.retrieved ? " (retrieved)" : ""}`}</title>
            </circle>
            <text x={n.x} y={n.y + 3} textAnchor="middle" fontSize="10" fontWeight="700" fill="#ffffff">
              {n.rank}
            </text>
          </g>
        ))}
        {/* center query node */}
        <circle cx={CX} cy={CY} r={13} fill="#001e2b" />
        <text x={CX} y={CY + 3} textAnchor="middle" fontSize="10" fontWeight="700" fill="#ffffff">
          you
        </text>
      </svg>

      <div className={styles.simLegend}>
        {[...new Set(nodes.map((n) => n.category))].map((c) => (
          <span key={c} className={styles.simLegendItem}>
            <span className={styles.simLegendDot} style={{ background: catColor(c) }} />
            {c}
          </span>
        ))}
        <span className={styles.simLegendItem}>◯ retrieved</span>
      </div>

      <ol className={styles.simList}>
        {nodes.map((n) => (
          <li key={n.slug} className={`${styles.simRow} ${n.retrieved ? styles.simRowHit : ""}`}>
            <span className={styles.simDot} style={{ background: catColor(n.category) }}>
              {n.rank}
            </span>
            <span className={styles.simTitle}>{n.title}</span>
            <span className={styles.simVal}>{n.similarity.toFixed(2)}</span>
          </li>
        ))}
      </ol>

      <p className={styles.mapNote}>
        Cosine similarity between your question (center) and the closest articles;
        thicker line = more similar. Highlighted = retrieved by hybrid search.
      </p>
    </div>
  );
}
