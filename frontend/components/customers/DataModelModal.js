"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { H3, Body } from "@leafygreen-ui/typography";
import JsonDocument from "@/components/forecasting/JsonDocument";
import { useCustomersModel } from "./useCustomersModel";
import styles from "../../style/customers/customers.module.css";

/**
 * Lightweight modal (portal + overlay) — avoids LeafyGreen's Modal, which trips
 * the React 19 `element.ref` change. Shows the sample documents and aggregation
 * pipelines behind the customers view.
 */
export default function DataModelModal({ open, setOpen, dataid }) {
  const { data, isLoading, error } = useCustomersModel(dataid, open);

  // Close on Escape and lock background scroll while open.
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

        <H3>MongoDB behind this view</H3>
        <Body className={styles.modelIntro}>
          The customer view is powered by flexible documents joined on demand.
          Below is a representative document from each collection it reads, plus
          the exact aggregation pipelines it runs for this customer.
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
              <p className={styles.modelSectionTitle}>
                Data model — sample documents
              </p>
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
              <p className={styles.modelSectionTitle}>Aggregation pipelines</p>
              {data.pipelines.map((p) => (
                <div key={p.title} className={styles.modelBlock}>
                  <div className={styles.modelBlockLabel}>
                    <span>{p.title}</span>
                    <span className={styles.modelBadge}>
                      db.{p.collection}.aggregate()
                    </span>
                  </div>
                  <JsonDocument document={p.stages} />
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
