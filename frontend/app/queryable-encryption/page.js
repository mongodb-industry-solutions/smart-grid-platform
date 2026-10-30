"use client";

import { useState, useCallback, useEffect } from "react";
import StepIndicator from "@/components/time-series-explorer/StepIndicator";
import PipelineViewer from "@/components/time-series-explorer/PipelineViewer";
import QeFlowDiagram from "@/components/queryable-encryption/QeFlowDiagram";
import QeSetupNotice from "@/components/queryable-encryption/QeSetupNotice";
import { QE_STEPS } from "@/lib/const/queryableEncryptionSteps";
import styles from "@/style/time-series-explorer/explorer.module.css";

export default function QueryableEncryptionPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const [showDiagram, setShowDiagram] = useState(false);

  const step = QE_STEPS[currentStep];
  const prevStep = step.prevStepId
    ? QE_STEPS.find((s) => s.id === step.prevStepId)
    : null;

  const handleStepClick = useCallback((i) => {
    setCurrentStep(i);
    setResult(null);
    setError(null);
    setErrorCode(null);
  }, []);

  const handleRun = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setErrorCode(null);
    setResult(null);
    try {
      const res = await fetch("/api/queryable-encryption/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepId: step.id,
          pipeline: step.pipeline,
          collection: step.collection,
          mode: step.mode,
          query: step.query,
          options: step.options,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setErrorCode(data.code ?? null);
      } else {
        setResult(data.rows);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [step]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "ArrowRight" && currentStep < QE_STEPS.length - 1) {
        handleStepClick(currentStep + 1);
      } else if (e.key === "ArrowLeft" && currentStep > 0) {
        handleStepClick(currentStep - 1);
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleRun();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentStep, handleStepClick, handleRun]);

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div className={styles.topRow}>
          <h1 className={styles.pageTitle}>
            Queryable Encryption Explorer{" "}
            <span>&middot; encrypt sensitive fields, keep them queryable</span>
          </h1>
        </div>
        <StepIndicator
          steps={QE_STEPS}
          currentStep={currentStep}
          onStepClick={handleStepClick}
        />
      </div>

      <div className={styles.body}>
        <div className={styles.diagramBar}>
          <button
            type="button"
            className={styles.diagramToggle}
            onClick={() => setShowDiagram((v) => !v)}
            aria-expanded={showDiagram}
          >
            <span className={styles.diagramCaret}>{showDiagram ? "▾" : "▸"}</span>
            How Queryable Encryption works
          </button>
        </div>
        {showDiagram && <QeFlowDiagram />}

        <div className={styles.description}>{step.description}</div>

        {errorCode && <QeSetupNotice code={errorCode} message={error} />}

        <PipelineViewer
          pipeline={step.pipeline}
          prevPipeline={prevStep?.pipeline ?? null}
          collection={step.collection}
          result={result}
          isLoading={isLoading}
          error={errorCode ? null : error}
          onRun={handleRun}
        />
      </div>

      <div className={styles.footer}>
        <div className={styles.sentence}>{step.sentence}</div>
        <div className={styles.keys}>
          &larr; &rarr; steps &nbsp;&middot;&nbsp; &#8984;&#8629; run
        </div>
      </div>
    </main>
  );
}
