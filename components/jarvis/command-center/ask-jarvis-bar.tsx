"use client";

import Link from "next/link";
import { useState } from "react";

const QUICK_QUESTIONS = [
  { key: "overdue", label: "What's overdue?" },
  { key: "wait", label: "What can wait?" },
  { key: "melusi", label: "How's Melusi trending?" },
  { key: "week", label: "What's my week look like?" },
] as const;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AskJarvisBarProps = {
  onSubmit: (message: string, followUpKey?: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  lastReply: string | null;
  followUpUsed: Set<string>;
  followUpThread: ChatMessage[];
};

export function AskJarvisBar({
  onSubmit,
  loading,
  error,
  lastReply,
  followUpUsed,
  followUpThread,
}: AskJarvisBarProps) {
  const [input, setInput] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) {
      return;
    }

    await onSubmit(trimmed);
    setInput("");
  }

  return (
    <div className="cc2-ask-section">
      <div className="cc2-qbar">
        <div className="cc2-qlabel">Ask Jarvis — quick questions</div>
        {QUICK_QUESTIONS.map((item) => {
          const used = followUpUsed.has(item.key);
          const disabled = used || loading;

          return (
            <button
              key={item.key}
              type="button"
              className={`cc2-qbtn${used ? " cc2-qbtn--used" : ""}`}
              disabled={disabled}
              title={used ? "Already asked" : undefined}
              onClick={() => {
                void onSubmit(item.label, item.key);
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {followUpThread.length > 0 ? (
        <div className="cc2-followup-thread" aria-label="Follow-up responses">
          {followUpThread.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`cc2-followup-msg cc2-followup-msg--${message.role}`}
            >
              {message.content}
            </div>
          ))}
        </div>
      ) : null}

      <form className="cc2-ask-bar" onSubmit={handleSubmit}>
        <label htmlFor="cc2-ask-input" className="sr-only">
          Ask Jarvis
        </label>
        <input
          id="cc2-ask-input"
          className="cc2-ask-input"
          placeholder="Ask Jarvis…"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={loading}
          autoComplete="off"
        />
        <button
          type="submit"
          className="cc2-btn cc2-btn--primary"
          disabled={loading || !input.trim()}
        >
          {loading ? "…" : "Send"}
        </button>
      </form>

      {error ? (
        <p className="cc2-ask-error" role="alert">
          {error}
        </p>
      ) : null}

      {lastReply ? (
        <div className="cc2-ask-reply" aria-live="polite">
          <p className="cc2-ask-reply-text">{lastReply}</p>
          <Link href="/assistant" className="cc2-ask-expand">
            Open in assistant →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
