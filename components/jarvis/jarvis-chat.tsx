"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { JarvisContextChip } from "@/components/jarvis/context/jarvis-context-chip";
import { useOptionalJarvisContext } from "@/components/jarvis/context/jarvis-context-provider";
import type { AgentKey } from "@/lib/jarvis/agents/types";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const EMPTY_MESSAGES: Message[] = [];

function getConversationKey(
  agentKey: AgentKey,
  threadId: string | null,
): string {
  return `${agentKey}:${threadId ?? "ephemeral"}`;
}

function normalizeMessages(messages: Message[]): Message[] {
  return messages.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") {
      return [];
    }

    if (typeof message.content !== "string") {
      return [];
    }

    const content = message.content.trim();

    if (content.length === 0) {
      return [];
    }

    return [{ role: message.role, content }];
  });
}

function messagesEqual(left: Message[], right: Message[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every(
    (message, index) =>
      message.role === right[index]?.role &&
      message.content === right[index]?.content,
  );
}

type PromptChip = {
  label: string;
  prompt: string;
  requiresSetup?: boolean;
  unavailableMessage?: string | null;
};

const DEFAULT_PROMPT_CHIPS: PromptChip[] = [
  { label: "Plan my next move", prompt: "Plan my next move" },
  { label: "Show my priorities", prompt: "Show my priorities" },
  { label: "Review today's schedule", prompt: "Review today's schedule" },
  { label: "Show overdue tasks", prompt: "Show overdue tasks" },
  { label: "Draft an important email", prompt: "Draft an important email" },
];

type JarvisChatProps = {
  variant?: "embedded" | "fullPage";
  userName?: string;
  agentKey?: AgentKey;
  threadId?: string | null;
  initialMessages?: Message[];
  agentDisplayName?: string;
  agentSubtitle?: string;
  expandHref?: string;
  welcomeHint?: string;
  promptChips?: PromptChip[];
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
  agentKey = "main",
  threadId: initialThreadId = null,
  initialMessages,
  agentDisplayName,
  agentSubtitle,
  expandHref,
  welcomeHint,
  promptChips,
}: JarvisChatProps) {
  const isEmbedded = variant === "embedded";
  const jarvisContext = useOptionalJarvisContext();
  const conversationKey = getConversationKey(agentKey, initialThreadId);
  const initializedConversationKeyRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<Message[]>(() =>
    normalizeMessages(initialMessages ?? EMPTY_MESSAGES),
  );
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  const displayName = agentDisplayName ?? "Jarvis";
  const subtitle =
    agentSubtitle ??
    (isEmbedded ? "Connected to your command center" : "Connected to your command center");
  const chips = promptChips ?? DEFAULT_PROMPT_CHIPS;
  const expandTarget = expandHref ?? "/assistant";

  useEffect(() => {
    if (initializedConversationKeyRef.current === conversationKey) {
      return;
    }

    initializedConversationKeyRef.current = conversationKey;

    const normalized = normalizeMessages(initialMessages ?? EMPTY_MESSAGES);

    setMessages((current) =>
      messagesEqual(current, normalized) ? current : normalized,
    );
    setThreadId(initialThreadId);
  }, [conversationKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading || sendingRef.current) {
      return;
    }

    sendingRef.current = true;
    const userMessage: Message = { role: "user", content: trimmed };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const requestBody: {
        message: string;
        agentKey?: AgentKey;
        threadId?: string;
        context?: { type: string; id: string };
      } = {
        message: trimmed,
        agentKey,
      };

      if (threadId) {
        requestBody.threadId = threadId;
      }

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

      const data = (await response.json()) as {
        reply?: string;
        error?: string;
        threadId?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Something went wrong. Please try again.");
      }

      if (typeof data.threadId === "string") {
        setThreadId(data.threadId);
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
      sendingRef.current = false;
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage(input);
  }

  function handleChipClick(chip: PromptChip) {
    setInput(chip.prompt);
    void sendMessage(chip.prompt);
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
              {displayName} Online
            </p>
          ) : null}
          <div className="jarvis-welcome-copy">
            <p className="jarvis-welcome-text">
              {isEmbedded
                ? agentKey === "melusi"
                  ? "What should Melusi focus on?"
                  : "What should we work on?"
                : welcomeText}
            </p>
            <p className="jarvis-welcome-hint">
              {welcomeHint ??
                (isEmbedded
                  ? "Connected to your command center."
                  : "Ask about tasks, schedule, email, goals, and planning.")}
            </p>
          </div>
          <div className="jarvis-chips">
            {chips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => handleChipClick(chip)}
                disabled={loading}
                className={`jarvis-chip${chip.requiresSetup ? " jarvis-chip--setup" : ""}`}
                title={
                  chip.requiresSetup
                    ? "Integration not connected yet"
                    : undefined
                }
              >
                {chip.label}
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
              <span className="jarvis-bubble-label">{displayName}</span>
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
          {displayName} is thinking…
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
            placeholder={
              isEmbedded
                ? `Ask ${displayName} anything…`
                : `Message ${displayName}…`
            }
            rows={isEmbedded ? 1 : 3}
            maxLength={4000}
            disabled={loading}
            className="jarvis-textarea"
            aria-label={`Message to ${displayName}`}
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
        className={`jarvis-panel jarvis-panel--full-page${agentKey === "melusi" ? " jarvis-panel--melusi" : ""}`}
        aria-label={`${displayName} assistant`}
      >
        <div className="jarvis-panel-atmosphere" aria-hidden="true" />
        <div className="jarvis-panel-inner jarvis-panel-inner--full-page">
          <div className="jarvis-panel-header jarvis-panel-header--full-page">
            <div className="jarvis-panel-identity jarvis-panel-identity--centered">
              <JarvisCore size="lg" />
              <div>
                <h1 className="jarvis-panel-title">{displayName}</h1>
                <p className="jarvis-panel-subtitle">{subtitle}</p>
                <p className="jarvis-status">
                  <span className="jarvis-status-dot" aria-hidden="true" />
                  {displayName} Online
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
      className={`jarvis-panel jarvis-panel--embedded${agentKey === "melusi" ? " jarvis-panel--melusi" : ""}`}
      aria-label={`${displayName} assistant`}
    >
      <div className="jarvis-panel-atmosphere" aria-hidden="true" />
      <Link href={expandTarget} className="jarvis-expand-link">
        <ExpandIcon />
        Expand
      </Link>
      {agentKey === "melusi" ? (
        <div className="jarvis-panel-agent-badge">Melusi Jarvis</div>
      ) : null}
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
