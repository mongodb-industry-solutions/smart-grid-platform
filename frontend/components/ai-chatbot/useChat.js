"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Per-tab persistence: sessionStorage survives reloads and client-side navigation
// away and back (the page unmounts), but clears when the tab closes — exactly
// "keep the conversation while I'm in this tab".
const MESSAGES_KEY = "aiChat.messages";
const THREAD_KEY = "aiChat.threadId";

function newThreadId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `t_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// Reuse the tab's threadId so the server-side memory (Mongo checkpointer, keyed by
// threadId) stays aligned with the restored transcript. Reading it into a ref is
// hydration-safe: refs aren't part of the rendered output.
function initialThreadId() {
  if (typeof window === "undefined") return newThreadId();
  return sessionStorage.getItem(THREAD_KEY) || newThreadId();
}

/**
 * Chat state + send logic. Conversation memory lives server-side (MongoDB
 * checkpointer keyed by threadId), so we send only the new message each turn.
 * Messages + threadId are persisted in sessionStorage so the conversation
 * survives reloads and in-tab navigation.
 */
export function useChat() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const threadId = useRef(initialThreadId());
  // Skip persisting on the very first commit so we don't clobber stored messages
  // with the initial empty array before the restore effect runs.
  const skipPersist = useRef(true);

  // Restore the transcript on mount (client only, avoids a hydration mismatch),
  // and make sure the tab's threadId is stored.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(MESSAGES_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch {
      /* ignore corrupt storage */
    }
    sessionStorage.setItem(THREAD_KEY, threadId.current);
  }, []);

  // Persist the transcript whenever it changes.
  useEffect(() => {
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }
    try {
      sessionStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
    } catch {
      /* storage full / unavailable — persistence is best-effort */
    }
  }, [messages]);

  const send = useCallback(
    async (text, category = null) => {
      const trimmed = (text ?? "").trim();
      if (!trimmed || isLoading) return;

      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/ai-chatbot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            threadId: threadId.current,
            category: category || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Request failed");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            module: data.moduleLabel,
            sources: data.sources ?? [],
            toolCalls: data.toolCalls ?? [],
            steps: data.steps ?? [],
          },
        ]);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading]
  );

  return { messages, isLoading, error, send };
}
