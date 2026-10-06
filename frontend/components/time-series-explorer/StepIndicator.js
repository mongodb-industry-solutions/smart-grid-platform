"use client";

import styles from "@/style/time-series-explorer/step-indicator.module.css";

export default function StepIndicator({ steps, currentStep, onStepClick }) {
  return (
    <nav className={styles.steps} aria-label="Explorer steps">
      {steps.map((step, i) => {
        const isCurrent = i === currentStep;
        const isDone = i < currentStep;

        return (
          <button
            key={step.id}
            className={`${styles.step} ${isCurrent ? styles.on : ""} ${isDone ? styles.done : ""}`}
            onClick={() => onStepClick(i)}
            aria-current={isCurrent ? "step" : undefined}
          >
            <span className={styles.num}>{step.num}</span>
            {step.title}
            {step.star && " \u2605"}
          </button>
        );
      })}
    </nav>
  );
}
