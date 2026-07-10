"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "../../style/ai-chatbot/chat.module.css";

export default function ChatMessage({ message }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className={`${styles.row} ${styles.rowUser}`}>
        <div className={`${styles.bubble} ${styles.bubbleUser}`}>
          <p className={styles.userText}>{message.content}</p>
        </div>
      </div>
    );
  }

  const hasSources = (message.sources?.length ?? 0) > 0;

  return (
    <div className={`${styles.row} ${styles.rowAssistant}`}>
      <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
        <div className={styles.markdown}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>

        {hasSources && (
          <div className={styles.meta}>
            <span className={styles.metaLabel}>Sources:</span>
            {message.sources.map((s) => (
              <span key={s.slug ?? s.title} className={styles.sourceChip} title={s.category}>
                {s.title}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
