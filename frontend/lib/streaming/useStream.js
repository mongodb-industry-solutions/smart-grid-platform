"use client";

import { useEffect, useState } from "react";

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
const BACKOFF_FACTOR = 1.5;
// Hold the shared connection briefly after the last consumer unmounts, so a
// route transition (unmount → remount) doesn't churn the EventSource.
const IDLE_TEARDOWN_MS = 2_000;

// A single shared EventSource per browser tab. Several components use this hook
// (live readings, charts, the meter panel); without sharing, each one opened its
// own connection to /api/stream — four sockets and four server-side SSE streams
// for one viewer. Now they all subscribe to one connection in this module.
let shared = null;

function createShared() {
  const subscribers = new Set();
  const state = { readings: [], lastEventAt: null, status: "connecting" };

  let es = null;
  let retryMs = INITIAL_RETRY_MS;
  let retryTimer = null;
  let teardownTimer = null;

  const emit = () => {
    const snapshot = { ...state };
    for (const fn of subscribers) fn(snapshot);
  };

  const connect = () => {
    if (es) es.close();
    state.status = "connecting";
    emit();

    es = new EventSource("/api/stream");

    es.onopen = () => {
      state.status = "connected";
      retryMs = INITIAL_RETRY_MS;
      emit();
    };

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === "readings" && Array.isArray(parsed.readings)) {
          state.readings = parsed.readings;
          state.lastEventAt = Date.now();
          emit();
        } else if (parsed.type === "error") {
          console.error("[useStream] server error:", parsed.message);
        }
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      es.close();
      es = null;
      state.status = "reconnecting";
      emit();

      // Exponential backoff.
      retryTimer = setTimeout(() => {
        retryTimer = null;
        retryMs = Math.min(retryMs * BACKOFF_FACTOR, MAX_RETRY_MS);
        connect();
      }, retryMs);
    };
  };

  connect();

  return {
    subscribe(fn) {
      if (teardownTimer) {
        clearTimeout(teardownTimer);
        teardownTimer = null;
      }
      subscribers.add(fn);
      fn({ ...state }); // push current state immediately

      return () => {
        subscribers.delete(fn);
        if (subscribers.size > 0) return;
        teardownTimer = setTimeout(() => {
          teardownTimer = null;
          if (subscribers.size > 0) return;
          if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = null;
          }
          if (es) {
            es.close();
            es = null;
          }
          shared = null;
        }, IDLE_TEARDOWN_MS);
      };
    },
  };
}

function getShared() {
  if (!shared) shared = createShared();
  return shared;
}

/**
 * Subscribes to the shared live-readings SSE connection.
 *
 * @returns {{
 *   readings: Array,          // latest batch of reading documents
 *   lastEventAt: number|null, // Date.now() of last received event
 *   status: string,           // "connecting" | "connected" | "reconnecting" | "disconnected"
 * }}
 */
export function useStream() {
  const [snapshot, setSnapshot] = useState({
    readings: [],
    lastEventAt: null,
    status: "connecting",
  });

  useEffect(() => getShared().subscribe(setSnapshot), []);

  return snapshot;
}
