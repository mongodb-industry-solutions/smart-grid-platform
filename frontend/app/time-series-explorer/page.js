"use client";

import { useState, useCallback, useEffect } from "react";
import StepIndicator from "@/components/time-series-explorer/StepIndicator";
import PipelineViewer from "@/components/time-series-explorer/PipelineViewer";
import { TIME_SERIES_STEPS } from "@/lib/const/timeSeriesSteps";
import styles from "@/style/time-series-explorer/explorer.module.css";

export default function TimeSeriesExplorerPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const step = TIME_SERIES_STEPS[currentStep];
  const prevStep = step.prevStepId
    ? TIME_SERIES_STEPS.find((s) => s.id === step.prevStepId)
    : null;

  // Reset result when changing steps
  const handleStepClick = useCallback((i) => {
    setCurrentStep(i);
    setResult(null);
    setError(null);
  }, []);

  // Run the pipeline
  const handleRun = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/time-series-explorer/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipeline: step.pipeline,
          collection: step.collection,
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

  // Keyboard navigation
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "ArrowRight" && currentStep < TIME_SERIES_STEPS.length - 1) {
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
      {/* Header with title and step indicator */}
      <div className={styles.header}>
        <div className={styles.topRow}>
          <h1 className={styles.pageTitle}>
            Time-Series Explorer{" "}
            <span>&middot; progressive aggregation walkthrough</span>
          </h1>
        </div>
        <StepIndicator
          steps={TIME_SERIES_STEPS}
          currentStep={currentStep}
          onStepClick={handleStepClick}
        />
      </div>

      {/* Body */}
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

      {/* Footer */}
      <div className={styles.footer}>
        <div className={styles.sentence}>{step.sentence}</div>
        <div className={styles.keys}>
          &larr; &rarr; steps &nbsp;&middot;&nbsp; &#8984;&#8629; run
        </div>
      </div>
    </main>
  );
}
