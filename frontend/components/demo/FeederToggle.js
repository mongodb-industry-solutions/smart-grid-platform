"use client";

import { useEffect, useState, useCallback } from "react";

const POLL_MS = 5_000;

/**
 * Compact feeder start/stop toggle for the app header. Shows current status
 * and lets the user start or stop the live feeder with one click.
 */
export default function FeederToggle() {
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/demo/status");
      const data = await res.json();
      setRunning(!!data.feederRunning);
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
    try {
      if (running) {
        await fetch("/api/demo/stop", { method: "POST" });
      } else {
        await fetch("/api/demo/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feeder: true }),
        });
      }
      // Give the backend a moment to start/stop, then refresh status.
      setTimeout(checkStatus, 1000);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={running ? "Stop live feeder" : "Start live feeder"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 6,
        border: "1px solid #e8edeb",
        background: loading ? "#f5f6f7" : "#fff",
        cursor: loading ? "wait" : "pointer",
        fontSize: 13,
        fontWeight: 500,
        color: running ? "#00684A" : "#89979b",
        transition: "all 0.15s",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: running ? "#00ED64" : "#ccc",
          boxShadow: running ? "0 0 6px rgba(0,237,100,0.5)" : "none",
        }}
      />
      {loading ? "..." : running ? "Feeder Live" : "Feeder Off"}
    </button>
  );
}
