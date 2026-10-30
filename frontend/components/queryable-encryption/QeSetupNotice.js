"use client";

import styles from "@/style/queryable-encryption/qe-setup.module.css";

// Friendly replacement for the raw configuration error the API returns when the
// Queryable Encryption demo is not wired up in this environment. The plaintext
// steps (1–2) still work; only the encrypted steps (3–6) need this setup.
const COPY = {
  QE_CONFIG: {
    title: "Queryable Encryption isn't configured in this environment",
    lead:
      "The encrypted steps (3–6) need a local KMS master key that matches the " +
      "key the demo data was encrypted with. Steps 1–2 (plaintext) still work.",
    steps: [
      "Provision the master key into the k8s `smart-grid` secret as QE_MASTER_KEY (ksec).",
      "Ensure the value matches backend/qe_masterkey.txt used to encrypt the data.",
      "Re-run the QE setup script against this cluster to create the encrypted collection.",
    ],
  },
  QE_NOT_SETUP: {
    title: "The encrypted collection doesn't exist yet",
    lead:
      "This cluster has no metering_points_encrypted collection, so there is " +
      "nothing to query. Steps 1–2 (plaintext) still work.",
    steps: [
      "Run backend/scripts/setup_qe.py against this cluster to build the encrypted collection and key vault.",
      "Reload this page and re-run the step.",
    ],
  },
};

export default function QeSetupNotice({ code, message }) {
  const copy = COPY[code] ?? {
    title: "Queryable Encryption is unavailable",
    lead: message || "The encrypted step could not run in this environment.",
    steps: [],
  };

  return (
    <div className={styles.notice}>
      <div className={styles.icon}>🔐</div>
      <div className={styles.content}>
        <div className={styles.title}>{copy.title}</div>
        <p className={styles.lead}>{copy.lead}</p>
        {copy.steps.length > 0 && (
          <ol className={styles.steps}>
            {copy.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        )}
        {message && (
          <details className={styles.details}>
            <summary>Technical detail</summary>
            <code>{message}</code>
          </details>
        )}
      </div>
    </div>
  );
}
