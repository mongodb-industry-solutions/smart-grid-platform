"use client";

import { useCallback, useRef, useState } from "react";

function newThreadId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `t_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Chat state + send logic. Conversation memory lives server-side (MongoDB
 * checkpointer keyed by threadId), so we send only the new message each turn.
 */
export function useChat() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const threadId = useRef(newThreadId());

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
