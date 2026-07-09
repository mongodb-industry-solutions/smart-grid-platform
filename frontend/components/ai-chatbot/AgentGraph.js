"use client";

import { Fragment } from "react";
import { Body } from "@leafygreen-ui/typography";
import { SKILLS_META, TOOL_LABELS } from "@/lib/ai/skillsMeta";
import styles from "../../style/ai-chatbot/chat.module.css";

// A short hint of a tool call's main argument, e.g. `dataid: 661` or the query.
function argHint(input) {
  if (!input || typeof input !== "object") return null;
  const keys = Object.keys(input);
  if (!keys.length) return null;
  const key = keys[0];
  let value = input[key];
  if (typeof value === "string" && value.length > 30) value = `${value.slice(0, 30)}…`;
  return `${key}: ${value}`;
}

// A layer of the graph reveals with a staggered delay so it feels like the
// agent is reasoning step by step.
function Layer({ index, className, children }) {
  return (
    <div
      className={`${styles.gLayer} ${className || ""}`}
      style={{ animationDelay: `${index * 0.18}s` }}
    >
      {children}
    </div>
  );
}

function Arrow({ index }) {
  return (
    <div className={styles.gArrow} style={{ animationDelay: `${index * 0.18}s` }}>
      ↓
    </div>
  );
}

/**
 * Dynamic "how the agent thinks" graph: shows the LangGraph path taken for the
 * latest question — question → Router → (skill chosen among all) → tools → KB
 * sources → answer — revealed step by step.
 */
export default function AgentGraph({ question, message, isLoading }) {
  if (!message && !isLoading) {
    return (
      <div className={styles.explorer}>
        <div className={styles.explorerTitle}>Agent Graph</div>
        <div className={styles.explorerEmpty}>
          <Body>
            Ask a question to watch the agent reason: the router picks a domain
            skill, calls tools, and composes an answer.
          </Body>
        </div>
      </div>
    );
  }

  // While loading we only know the question + that routing is happening.
  const routing = isLoading && !message;
  const activeLabel = message?.module ?? null;
  const steps = message?.steps ?? [];
  const sources = message?.sources ?? [];

  // Remount (replay animation) whenever the exchange changes.
  const runKey = routing
    ? "loading"
    : `${activeLabel}-${steps.map((s) => s.name).join(",")}-${sources.length}`;

  let i = 0;
  return (
    <div className={styles.explorer}>
      <div className={styles.explorerTitle}>Agent Graph</div>
      <div className={styles.graph} key={runKey}>
        {question && (
          <Layer index={i++} className={styles.gQuestion}>
            <span className={styles.gQuestionText}>“{question}”</span>
          </Layer>
        )}

        <Arrow index={i} />
        <Layer index={i++}>
          <span className={`${styles.gNode} ${styles.gRouter} ${routing ? styles.gPulse : ""}`}>
            Router{routing ? " · routing…" : ""}
          </span>
        </Layer>

        {!routing && (
          <>
            <Arrow index={i} />
            <Layer index={i++} className={styles.gSkills}>
              {SKILLS_META.map((s) => (
                <span
                  key={s.id}
                  className={`${styles.gSkill} ${
                    s.label === activeLabel ? styles.gSkillActive : ""
                  }`}
                >
                  {s.label}
                </span>
              ))}
            </Layer>

            {steps.length ? (
              steps.map((s, si) => (
                <Fragment key={si}>
                  <Arrow index={i} />
                  <Layer index={i++} className={styles.gTools}>
                    <span className={`${styles.gNode} ${styles.gTool}`}>
                      <span className={styles.gToolName}>{TOOL_LABELS[s.name] ?? s.name}</span>
                      {argHint(s.input) && (
                        <span className={styles.gToolArg}>{argHint(s.input)}</span>
                      )}
                    </span>
                  </Layer>
                </Fragment>
              ))
            ) : (
              <>
                <Arrow index={i} />
                <Layer index={i++} className={styles.gTools}>
                  <span className={styles.gToolNone}>no tools — answered directly</span>
                </Layer>
              </>
            )}

            {sources.length > 0 && (
              <>
                <Arrow index={i} />
                <Layer index={i++} className={styles.gSources}>
                  <span className={styles.gSourcesLabel}>retrieved</span>
                  {sources.map((s) => (
                    <span key={s.slug ?? s.title} className={styles.gSource}>
                      {s.title}
                    </span>
                  ))}
                </Layer>
              </>
            )}

            <Arrow index={i} />
            <Layer index={i++}>
              <span className={`${styles.gNode} ${styles.gAnswer}`}>Answer</span>
            </Layer>
          </>
        )}
      </div>
    </div>
  );
}
