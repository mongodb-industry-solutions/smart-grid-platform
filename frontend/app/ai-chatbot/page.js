"use client";

import { useEffect, useRef, useState } from "react";
import { H2, Body } from "@leafygreen-ui/typography";
import Icon from "@leafygreen-ui/icon";
import ChatMessage from "@/components/ai-chatbot/ChatMessage";
import AssistantPanel from "@/components/ai-chatbot/AssistantPanel";
import { useChat } from "@/components/ai-chatbot/useChat";
import { useVectorMap } from "@/components/ai-chatbot/useVectorMap";
import styles from "@/style/ai-chatbot/chat.module.css";

const SUGGESTIONS = [
  "Which region is showing abnormal consumption?",
  "What customer segments are most affected?",
  "What is the likely demand peak tomorrow?"  ,
  "What is a demand charge and how do I lower it?",
  "TOU vs tiered — which fits evening-heavy usage?",
  "Give me the current outage summary.",
  "Which regions have the highest expected peak demand?",
];

export default function AIChatbotPage() {
  const { messages, isLoading, error, send } = useChat();
  const { map, isLoading: mapLoading, error: mapError, run: runMap } = useVectorMap();
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-grow the textarea with content, up to a max height (then it scrolls).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = (text) => {
    const q = (text ?? "").trim();
    if (!q) return;
    send(q);
    runMap(q); // update the Vector Map tab for this query
  };

  const submit = (e) => {
    e?.preventDefault();
    handleSend(input);
    setInput("");
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <div className={styles.titleRow}>
            <H2>Grid Support Agent</H2>
            <span
              className={styles.infoWrap}
              tabIndex={0}
              role="button"
              aria-label="Technical details"
            >
              <Icon glyph="InfoWithCircle" />
              <span className={styles.tooltip} role="tooltip">
                A <strong>LangGraph supervisor</strong> routes each question to a
                domain skill (outages, forecasting, tariffs, customers, grid,
                anomalies, knowledge base) and calls MongoDB tools for live data.
                The knowledge base uses <strong>hybrid search</strong> (Atlas
                Vector Search with <strong>automated Voyage AI embeddings</strong>
                {" "}+ full-text, fused with Reciprocal Rank Fusion). Conversation
                memory is persisted in <strong>MongoDB</strong>. Answers by Claude
                via the Grove gateway.
              </span>
            </span>
          </div>
          <Body className={styles.subtitle}>
            Ask anything about the grid in plain language. A LangGraph agent
            picks the right skill (outages, tariffs, forecasting…), answers with
            hybrid vector search + live MongoDB queries, and remembers the
            context.
          </Body>
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.chatCard}>
          <div className={styles.messages}>
            {messages.length === 0 && (
              <div className={styles.empty}>
                <Body weight="medium">Try one of these:</Body>
                <div className={styles.suggestions}>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={styles.suggestion}
                      onClick={() => handleSend(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <ChatMessage key={i} message={m} />
            ))}

            {isLoading && <div className={styles.typing}>Assistant is thinking…</div>}
            {error && <div className={styles.errorText}>Error: {error}</div>}
            <div ref={endRef} />
          </div>

          <div className={styles.suggestBar}>
            {showSuggestions && (
              <div className={styles.suggestList}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={styles.suggestion}
                    onClick={() => {
                      handleSend(s);
                      setShowSuggestions(false);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              className={styles.suggestToggle}
              onClick={() => setShowSuggestions((v) => !v)}
              aria-expanded={showSuggestions}
            >
              <Icon glyph="Bulb" />
              Suggested questions
              <Icon
                glyph={showSuggestions ? "ChevronDown" : "ChevronUp"}
                className={styles.suggestChevron}
              />
            </button>
          </div>

          <form className={styles.inputBar} onSubmit={submit}>
            <textarea
              ref={inputRef}
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask a question…"
              rows={1}
              disabled={isLoading}
            />
            <button
              type="submit"
              className={styles.sendBtn}
              disabled={isLoading || !input.trim()}
            >
              Send
            </button>
          </form>
        </div>

        <AssistantPanel
          question={lastUser?.content}
          message={isLoading ? null : lastAssistant}
          isLoading={isLoading}
          map={map}
          mapLoading={mapLoading}
          mapError={mapError}
        />
      </div>
    </main>
  );
}
