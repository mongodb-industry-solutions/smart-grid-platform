"use client";

import { useState, useCallback, useEffect } from "react";
import StepIndicator from "@/components/time-series-explorer/StepIndicator";
import PipelineViewer from "@/components/time-series-explorer/PipelineViewer";
import { QE_STEPS } from "@/lib/const/queryableEncryptionSteps";
import styles from "@/style/time-series-explorer/explorer.module.css";

export default function QueryableEncryptionPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const step = QE_STEPS[currentStep];
  const prevStep = step.prevStepId
    ? QE_STEPS.find((s) => s.id === step.prevStepId)
    : null;

  const handleStepClick = useCallback((i) => {
    setCurrentStep(i);
    setResult(null);
    setError(null);
  }, []);

  const handleRun = useCallback(async () => {
    setIsLoading(true);
    setError(null);
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
        <div className={styles.description}>{step.description}</div>

        <PipelineViewer
          pipeline={step.pipeline}
          prevPipeline={prevStep?.pipeline ?? null}
          collection={step.collection}
          result={result}
          isLoading={isLoading}
          error={error}
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
