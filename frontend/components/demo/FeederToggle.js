"use client";

import { useEffect, useState, useCallback } from "react";
import styles from "@/style/demo/feeder-toggle.module.css";

const POLL_MS = 5_000;

/**
 * Compact feeder start/stop toggle for the app header. Shows current status
 * and lets the user start or stop the live feeder with one click.
 *
 * While the feeder is off the button blinks and a hint bubble invites the user
 * to start it — without the feeder there is no live stream, so the LIVE panels
 * on the monitoring page sit empty and look broken.
 */
export default function FeederToggle() {
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusKnown, setStatusKnown] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/demo/status");
      const data = await res.json();
      setRunning(!!data.feederRunning);
      setStatusKnown(true);
    } catch {
      // ignore — we'll retry on next poll
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const id = setInterval(checkStatus, POLL_MS);
    return () => clearInterval(id);
  }, [checkStatus]);

  const toggle = async () => {
    setLoading(true);
    setHintDismissed(true);
    try {
      const endpoint = running ? "/api/demo/feeder/stop" : "/api/demo/feeder/start";
      await fetch(endpoint, { method: "POST" });
      // Give the backend a moment to start/stop, then refresh status.
      setTimeout(checkStatus, 1000);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  // Only nudge once we've confirmed with the backend that it really is off.
  const needsAttention = statusKnown && !running && !loading;

  return (
    <div className={styles.wrapper}>
      <button
        onClick={toggle}
        disabled={loading}
        title={running ? "Stop live feeder" : "Start live feeder"}
        className={[
          styles.toggle,
          running ? styles.running : "",
          needsAttention ? styles.attention : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span className={styles.dot} />
        {loading ? "..." : running ? "Feeder Live" : "Feeder Off"}
      </button>

      {needsAttention && !hintDismissed && (
        <div className={styles.bubble} role="status">
          <div className={styles.bubbleRow}>
            <span>
              The live feeder is off, so real-time panels have no data. Click
              here to start streaming meter readings.
            </span>
            <button
              type="button"
              className={styles.dismiss}
              onClick={() => setHintDismissed(true)}
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
