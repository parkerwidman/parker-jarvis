"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { JarvisContextChip } from "@/components/jarvis/context/jarvis-context-chip";
import { useOptionalJarvisContext } from "@/components/jarvis/context/jarvis-context-provider";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const PROMPT_CHIPS = [
  "Plan my next move",
  "Show my priorities",
  "Review today's schedule",
  "Show overdue tasks",
  "Draft an important email",
] as const;

type JarvisChatProps = {
  variant?: "embedded" | "fullPage";
  userName?: string;
};

function JarvisCore({ size }: { size: "sm" | "md" | "lg" }) {
  const ringCount = size === "sm" ? 2 : size === "md" ? 3 : 4;

  return (
    <div className={`jarvis-core jarvis-core--${size}`} aria-hidden="true">
      {Array.from({ length: ringCount }, (_, i) => (
        <span key={i} className="jarvis-core-ring" />
      ))}
      <span className="jarvis-core-dot" />
    </div>
  );
}

function ExpandIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M3.5 1.5h7v7M10.5 1.5L1.5 10.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 8h11M9 4.5L13.5 8 9 11.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function JarvisChat({
  variant = "fullPage",
  userName,
}: JarvisChatProps) {
  const isEmbedded = variant === "embedded";
  const jarvisContext = useOptionalJarvisContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) {
      return;
    }

    const userMessage: Message = { role: "user", content: trimmed };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const requestBody: {
        message: string;
        context?: { type: string; id: string };
      } = { message: trimmed };

      if (jarvisContext?.target) {
        requestBody.context = {
          type: jarvisContext.target.type,
          id: jarvisContext.target.id,
        };
      }

      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = (await response.json()) as { reply?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Something went wrong. Please try again.");
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply ?? "" },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage(input);
  }

  function handleChipClick(prompt: string) {
    setInput(prompt);
    void sendMessage(prompt);
  }

  const welcomeText = userName
    ? `What should we work on, ${userName}?`
    : "What should we work on?";

  const messageContent = (
    <>
      {messages.length === 0 && !loading ? (
        <div
          className={
            isEmbedded
              ? "jarvis-welcome jarvis-welcome--embedded"
              : "jarvis-welcome"
          }
        >
          {isEmbedded ? <JarvisCore size="lg" /> : null}
          {isEmbedded ? (
            <p className="jarvis-status jarvis-status--centered">
              <span className="jarvis-status-dot" aria-hidden="true" />
              Jarvis Online
            </p>
          ) : null}
          <div className="jarvis-welcome-copy">
            <p className="jarvis-welcome-text">
              {isEmbedded ? "What should we work on?" : welcomeText}
            </p>
            <p className="jarvis-welcome-hint">
              {isEmbedded
                ? "Connected to your command center."
                : "Ask about tasks, schedule, email, goals, and planning."}
            </p>
          </div>
          <div className="jarvis-chips">
            {PROMPT_CHIPS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => handleChipClick(prompt)}
                disabled={loading}
                className="jarvis-chip"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      ) : (
        messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === "user"
                ? "jarvis-bubble jarvis-bubble--user"
                : "jarvis-bubble jarvis-bubble--assistant"
            }
          >
            {message.role === "assistant" ? (
              <span className="jarvis-bubble-label">Jarvis</span>
            ) : null}
            <p className="jarvis-bubble-content">{message.content}</p>
          </div>
        ))
      )}

      {loading ? (
        <p className="jarvis-thinking" aria-live="polite">
          <span className="jarvis-thinking-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          Jarvis is thinking…
        </p>
      ) : null}

      <div ref={messagesEndRef} />
    </>
  );

  const inputForm = (
    <>
      <JarvisContextChip />
      {error ? <p className="jarvis-error">{error}</p> : null}
      <form onSubmit={handleSubmit} className="jarvis-input-area">
        <div className="jarvis-input-row">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={isEmbedded ? "Ask Jarvis anything…" : "Message Jarvis…"}
            rows={isEmbedded ? 1 : 3}
            maxLength={4000}
            disabled={loading}
            className="jarvis-textarea"
            aria-label="Message to Jarvis"
          />
          <button
            type="submit"
            disabled={loading || input.trim().length === 0}
            className="jarvis-send"
            aria-label="Send message"
          >
            {isEmbedded ? <SendIcon /> : "Send"}
          </button>
        </div>
      </form>
    </>
  );

  if (!isEmbedded) {
    return (
      <section
        className="jarvis-panel jarvis-panel--full-page"
        aria-label="Jarvis assistant"
      >
        <div className="jarvis-panel-atmosphere" aria-hidden="true" />
        <div className="jarvis-panel-inner jarvis-panel-inner--full-page">
          <div className="jarvis-panel-header jarvis-panel-header--full-page">
            <div className="jarvis-panel-identity jarvis-panel-identity--centered">
              <JarvisCore size="lg" />
              <div>
                <h1 className="jarvis-panel-title">Jarvis</h1>
                <p className="jarvis-panel-subtitle">
                  Connected to your command center
                </p>
                <p className="jarvis-status">
                  <span className="jarvis-status-dot" aria-hidden="true" />
                  Jarvis Online
                </p>
              </div>
            </div>
          </div>
          <div
            className="jarvis-messages jarvis-messages--full-page"
            aria-live="polite"
            aria-label="Conversation"
          >
            {messageContent}
          </div>
          {inputForm}
        </div>
      </section>
    );
  }

  return (
    <section
      id="jarvis-embedded-panel"
      tabIndex={-1}
      className="jarvis-panel jarvis-panel--embedded"
      aria-label="Jarvis assistant"
    >
      <div className="jarvis-panel-atmosphere" aria-hidden="true" />
      <Link href="/assistant" className="jarvis-expand-link">
        <ExpandIcon />
        Expand
      </Link>
      <div className="jarvis-panel-inner">
        <div
          className="jarvis-messages jarvis-messages--embedded"
          aria-live="polite"
          aria-label="Conversation"
        >
          {messageContent}
        </div>
        {inputForm}
      </div>
    </section>
  );
}
