"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { H3, Body } from "@leafygreen-ui/typography";
import JsonDocument from "@/components/forecasting/JsonDocument";
import { useModelData } from "./useModelData";
import styles from "../../style/customers/customers.module.css";

function operationLabel(op) {
  const suffix =
    op.type === "aggregate"
      ? "aggregate()"
      : op.type === "findOne"
      ? "findOne()"
      : "find()";
  return `db.${op.collection}.${suffix}`;
}

function operationBody(op) {
  if (op.type === "aggregate") return op.pipeline;
  const body = { filter: op.filter };
  if (op.sort) body.sort = op.sort;
  if (op.projection) body.projection = op.projection;
  return body;
}

/**
 * Lightweight modal (portal + overlay) showing the sample documents and
 * queries/pipelines behind ONE component of the customers view.
 */
export default function DataModelModal({ open, setOpen, scope = "customers", component, dataid }) {
  const { data, isLoading, error } = useModelData(scope, component, dataid, open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, setOpen]);

  if (!open) return null;

  return createPortal(
    <div className={styles.modalOverlay} onClick={() => setOpen(false)}>
      <div
        className={styles.modalDialog}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={styles.modalClose}
          onClick={() => setOpen(false)}
          aria-label="Close"
        >
          ×
        </button>

        <H3>{data?.title ? `${data.title} — MongoDB` : "MongoDB"}</H3>
        <Body className={styles.modelIntro}>
          The documents and queries this component uses. MongoDB&apos;s document
          model keeps related data together and joins the rest on demand.
        </Body>

        {isLoading && <Body>Loading…</Body>}
        {error && (
          <Body className={styles.empty} style={{ color: "#DB3030" }}>
            {error}
          </Body>
        )}

        {data && (
          <>
            <section className={styles.modelSection}>
              <p className={styles.modelSectionTitle}>Documents</p>
              {data.collections.map((c) => (
                <div key={c.name} className={styles.modelBlock}>
                  <div className={styles.modelBlockLabel}>
                    <span>db.{c.name}</span>
                    <span className={styles.modelBadge}>document</span>
                  </div>
                  <JsonDocument document={c.sample} />
                </div>
              ))}
            </section>

            <section className={styles.modelSection}>
              <p className={styles.modelSectionTitle}>Queries &amp; pipelines</p>
              {data.operations.map((op) => (
                <div key={op.title} className={styles.modelBlock}>
                  <div className={styles.modelBlockLabel}>
                    <span>{op.title}</span>
                    <span className={styles.modelBadge}>{operationLabel(op)}</span>
                  </div>
                  <JsonDocument document={operationBody(op)} />
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
