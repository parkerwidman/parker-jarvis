"use client";

import Link from "next/link";
import { useState } from "react";

type AskJarvisBarProps = {
  onSubmit: (message: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  lastReply: string | null;
};

export function AskJarvisBar({
  onSubmit,
  loading,
  error,
  lastReply,
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
