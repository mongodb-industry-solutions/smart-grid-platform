"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
const BACKOFF_FACTOR = 1.5;

/**
 * React hook that connects to the /api/stream SSE endpoint and returns
 * live readings as they arrive from the MongoDB Change Stream.
 *
 * @returns {{
 *   readings: Array,          // latest batch of reading documents
 *   lastEventAt: number|null, // Date.now() of last received event
 *   status: string,           // "connecting" | "connected" | "reconnecting" | "disconnected"
 * }}
 */
export function useStream() {
  const [readings, setReadings] = useState([]);
  const [lastEventAt, setLastEventAt] = useState(null);
  const [status, setStatus] = useState("connecting");
  const retryMs = useRef(INITIAL_RETRY_MS);
  const esRef = useRef(null);
  const retryTimer = useRef(null);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
    }

    setStatus("connecting");
    const es = new EventSource("/api/stream");
    esRef.current = es;

    es.onopen = () => {
      setStatus("connected");
      retryMs.current = INITIAL_RETRY_MS;
    };

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === "readings" && Array.isArray(parsed.readings)) {
          setReadings(parsed.readings);
          setLastEventAt(Date.now());
        } else if (parsed.type === "error") {
          console.error("[useStream] server error:", parsed.message);
        }
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setStatus("reconnecting");

      // Exponential backoff.
      retryTimer.current = setTimeout(() => {
        retryMs.current = Math.min(retryMs.current * BACKOFF_FACTOR, MAX_RETRY_MS);
        connect();
      }, retryMs.current);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (esRef.current) esRef.current.close();
      if (retryTimer.current) clearTimeout(retryTimer.current);
      setStatus("disconnected");
    };
  }, [connect]);

  return { readings, lastEventAt, status };
}
