"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { H3, Body } from "@leafygreen-ui/typography";
import Button from "@leafygreen-ui/button";

const STEPS = [
  { key: "generate", label: "Generate the dataset (dated to today)" },
  { key: "load", label: "Load the collections into MongoDB Atlas" },
  { key: "kb", label: "Seed the AI knowledge base" },
  { key: "feeder", label: "Start the live feeder" },
];

// Order used to mark earlier steps done when a later one starts.
const ORDER = STEPS.map((s) => s.key);

// Step status icon: green check when done, otherwise a spinning loader (brighter
// for the in-progress step, faint for steps still queued) so progress reads at a
// glance without a log line.
function StepIcon({ isDone, isCurrent }) {
  if (isDone) return <span style={{ fontSize: 16, lineHeight: 1 }}>✅</span>;
  return (
    <span
      style={{
        display: "inline-block",
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: "2px solid #e8edeb",
        borderTopColor: isCurrent ? "#00684a" : "#c1c7c6",
        opacity: isCurrent ? 1 : 0.55,
        animation: "demoSpin 0.7s linear infinite",
      }}
    />
  );
}

// "today", "yesterday", or an absolute date, for the last-generated context line.
function formatGeneratedAt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (days <= 0) return `today (${date})`;
  if (days === 1) return `yesterday (${date})`;
  return `${days} days ago (${date})`;
}

export default function DemoStartModal() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [readingsCount, setReadingsCount] = useState(0);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [phase, setPhase] = useState("intro"); // intro | running | done | error
  const [currentStep, setCurrentStep] = useState(null);
  const [doneSteps, setDoneSteps] = useState(() => new Set());
  const [errorMsg, setErrorMsg] = useState("");
  const startedRef = useRef(false);

  // Shown once per session as a welcome/control screen. It adapts to whether data
  // already exists, so returning users can enter instantly (no forced 2-3 min
  // regeneration) while still being able to refresh with today's dates.
  useEffect(() => {
    setMounted(true);
    // Once-per-session: don't reopen on refresh, and don't loop after the
    // post-generation reload.
    if (sessionStorage.getItem("demoModalSeen") === "1") return;
    let active = true;
    // Resolve the data status BEFORE showing, so the modal opens with the right
    // buttons instead of flashing "Start Demo" then swapping to the two-button
    // (data-present) layout.
    fetch("/api/demo/status")
      .then((r) => r.json())
      .then((s) => {
        if (!active) return;
        setSeeded(!!s.seeded);
        setReadingsCount(s.readingsCount || 0);
        setGeneratedAt(s.generatedAt || null);
      })
      .catch(() => {})
      .finally(() => {
        if (!active) return;
        sessionStorage.setItem("demoModalSeen", "1");
        setVisible(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const markStep = (key) => {
    setCurrentStep(key);
    setDoneSteps((prev) => {
      const next = new Set(prev);
      const idx = ORDER.indexOf(key);
      ORDER.slice(0, idx).forEach((k) => next.add(k));
      return next;
    });
  };

  async function startDemo() {
    if (startedRef.current) return;
    startedRef.current = true;
    setPhase("running");
    setErrorMsg("");
    try {
      const res = await fetch("/api/demo/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feeder: true }),
      });
      if (!res.ok || !res.body) {
        const msg = await res
          .json()
          .then((b) => b.error)
          .catch(() => null);
        throw new Error(msg || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          let evt;
          try {
            evt = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          if (evt.event === "step") markStep(evt.step);
          else if (evt.event === "done") {
            setDoneSteps(new Set(ORDER));
            setCurrentStep(null);
            setPhase("done");
          } else if (evt.event === "error") {
            setErrorMsg(evt.message || "Something went wrong.");
            setPhase("error");
          }
        }
      }
    } catch (err) {
      setErrorMsg(err.message || "Failed to start the demo.");
      setPhase("error");
    } finally {
      startedRef.current = false;
    }
  }

  // Enter without regenerating — just close the modal (data already present).
  const dismiss = () => setVisible(false);

  // Close and reload so freshly generated data shows everywhere.
  const enter = () => window.location.reload();

  if (!mounted || !visible) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <style>{"@keyframes demoSpin{to{transform:rotate(360deg)}}"}</style>
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          maxWidth: 560,
          width: "100%",
          padding: 32,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        <H3 style={{ marginBottom: 8 }}>⚡ Smart Grid Intelligent Platform</H3>
        <Body style={{ color: "#5c6c75" }}>
          This demo turns raw smart-meter data into real-time grid operations on MongoDB
          Atlas: outage monitoring, network health, customer insights, demand forecasting,
          and a natural-language grid support agent.
        </Body>

        {phase === "intro" && (
          <>
            <Body style={{ marginTop: 16 }}>
              {seeded ? (
                <>
                  Data is already loaded ({readingsCount.toLocaleString()} readings
                  {generatedAt ? `, generated ${formatGeneratedAt(generatedAt)}` : ""}). You can
                  enter the demo now, or regenerate a fresh dataset dated to <b>today</b> and
                  restart the <b>live feed</b>. Regenerating takes a couple of minutes.
                </>
              ) : (
                <>
                  Starting the demo generates a fresh dataset dated to <b>today</b> (30 days of
                  15-minute readings for 250 meters), loads it into your Atlas cluster, and turns
                  on a <b>live feed</b> so the dashboards update in real time. This takes a couple
                  of minutes.
                </>
              )}
            </Body>
            <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "flex-end" }}>
              {seeded && (
                <Button variant="default" onClick={dismiss}>
                  Enter the demo
                </Button>
              )}
              <Button variant="primary" onClick={startDemo}>
                {seeded ? "Regenerate with today's data" : "Start Demo"}
              </Button>
            </div>
          </>
        )}

        {(phase === "running" || phase === "done") && (
          <div style={{ marginTop: 24 }}>
            {STEPS.map((s) => {
              const isDone = doneSteps.has(s.key);
              const isCurrent = currentStep === s.key;
              return (
                <div
                  key={s.key}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}
                >
                  <span
                    style={{
                      width: 20,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <StepIcon isDone={isDone} isCurrent={isCurrent} />
                  </span>
                  <Body
                    style={{
                      color: isDone ? "#00684a" : isCurrent ? "#1a1a1a" : "#89979b",
                      fontWeight: isCurrent ? 600 : 400,
                    }}
                  >
                    {s.label}
                  </Body>
                </div>
              );
            })}
            {phase === "done" && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
                <Button variant="primary" onClick={enter}>
                  Enter the demo
                </Button>
              </div>
            )}
          </div>
        )}

        {phase === "error" && (
          <>
            <Body style={{ marginTop: 16, color: "#970606" }}>
              {errorMsg}
            </Body>
            <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="default" onClick={dismiss}>
                Close
              </Button>
              <Button variant="primary" onClick={startDemo}>
                Retry
              </Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
