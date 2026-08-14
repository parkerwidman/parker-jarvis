"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { JarvisContextChip } from "@/components/jarvis/context/jarvis-context-chip";
import { JarvisMarkdownResponse } from "@/components/jarvis/jarvis-markdown-response";
import {
  consumeJarvisAssistantStream,
  createStreamDeltaBatcher,
} from "@/lib/jarvis/streaming/client-stream";
import {
  type ChatMessage,
  type ChatMessageInput,
  chatMessagesEqual,
  createCompletedAssistantMessage,
  createOptimisticUserMessage,
  createStreamingAssistantClientId,
  createClientMessageId,
  getMessageRenderKey,
  normalizeChatMessages,
} from "@/lib/jarvis/streaming/chat-message-identity";
import { useOptionalJarvisContext } from "@/components/jarvis/context/jarvis-context-provider";
import type { AgentKey } from "@/lib/jarvis/agents/types";

type Message = ChatMessage;

const EMPTY_MESSAGES: Message[] = [];

function getConversationKey(
  agentKey: AgentKey,
  threadId: string | null,
): string {
  return `${agentKey}:${threadId ?? "ephemeral"}`;
}

function normalizeMessages(messages: ChatMessageInput[]): Message[] {
  return normalizeChatMessages(messages);
}

function messagesEqual(left: Message[], right: Message[]): boolean {
  return chatMessagesEqual(left, right);
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
  variant?: "embedded" | "fullPage" | "compact";
  userName?: string;
  agentKey?: AgentKey;
  threadId?: string | null;
  initialMessages?: ChatMessageInput[];
  agentDisplayName?: string;
  agentSubtitle?: string;
  expandHref?: string;
  welcomeHint?: string;
  promptChips?: PromptChip[];
  compactStatusLine?: string;
  deferCompactHistory?: boolean;
  hasOlderMessages?: boolean;
  loadingOlderMessages?: boolean;
  messagesApiPath?: string;
  onThreadIdChange?: (
    threadId: string,
    firstMessage: string,
    options?: { streaming?: boolean },
  ) => void;
  richAssistantResponses?: boolean;
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
  compactStatusLine,
  deferCompactHistory = false,
  hasOlderMessages = false,
  loadingOlderMessages: loadingOlderMessagesProp = false,
  messagesApiPath,
  onThreadIdChange,
  richAssistantResponses = false,
}: JarvisChatProps) {
  const isCompact = variant === "compact";
  const isEmbedded = variant === "embedded" || isCompact;
  const [isExpanded, setIsExpanded] = useState(false);
  const jarvisContext = useOptionalJarvisContext();
  const conversationKey = getConversationKey(agentKey, initialThreadId);
  const initializedConversationKeyRef = useRef<string | null>(null);
  const deferredMessagesRef = useRef<Message[]>(
    normalizeMessages(initialMessages ?? EMPTY_MESSAGES),
  );
  const [messages, setMessages] = useState<Message[]>(() =>
    deferCompactHistory && isCompact
      ? EMPTY_MESSAGES
      : normalizeMessages(initialMessages ?? EMPTY_MESSAGES),
  );
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(hasOlderMessages);
  const [loadingOlder, setLoadingOlder] = useState(loadingOlderMessagesProp);
  const [streamingAssistantContent, setStreamingAssistantContent] = useState<
    string | null
  >(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const shouldStickToBottomRef = useRef(true);
  const firstUserMessageRef = useRef<string | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const generationIdRef = useRef(0);
  const streamingContentRef = useRef("");
  const streamingAssistantClientIdRef = useRef<string | null>(null);
  const useMainStreaming = richAssistantResponses && agentKey === "main";

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
    deferredMessagesRef.current = normalized;

    if (deferCompactHistory && isCompact && !isExpanded) {
      setMessages((current) =>
        current.length === 0 ? current : EMPTY_MESSAGES,
      );
      setThreadId(initialThreadId);
      return;
    }

    setMessages((current) =>
      messagesEqual(current, normalized) ? current : normalized,
    );
    setThreadId(initialThreadId);
  }, [conversationKey, deferCompactHistory, initialMessages, initialThreadId, isCompact, isExpanded]);

  function handleCompactExpand() {
    if (deferCompactHistory && messages.length === 0) {
      setMessages(deferredMessagesRef.current);
    }

    setIsExpanded(true);
  }

  function handleCompactCollapse() {
    setIsExpanded(false);

    if (deferCompactHistory) {
      setMessages(EMPTY_MESSAGES);
    }
  }

  useEffect(() => {
    setHasOlder(hasOlderMessages);
  }, [hasOlderMessages, conversationKey]);

  function updateStickToBottom() {
    const container = messagesContainerRef.current;

    if (!container) {
      shouldStickToBottomRef.current = true;
      return;
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    shouldStickToBottomRef.current = distanceFromBottom < 96;
  }

  useEffect(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, streamingAssistantContent]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading || sendingRef.current) {
      return;
    }

    sendingRef.current = true;
    const generationId = generationIdRef.current + 1;
    generationIdRef.current = generationId;
    streamAbortRef.current?.abort();
    const streamAbort = new AbortController();
    streamAbortRef.current = streamAbort;

    const userMessage = createOptimisticUserMessage(trimmed);
    const streamingAssistantClientId = useMainStreaming
      ? createStreamingAssistantClientId(generationId)
      : null;
    streamingAssistantClientIdRef.current = streamingAssistantClientId;

    if (!threadId && !firstUserMessageRef.current) {
      firstUserMessageRef.current = trimmed;
    }

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);
    setStreamingAssistantContent(null);
    streamingContentRef.current = "";

    if (isCompact) {
      setIsExpanded(true);
    }

    const requestBody: {
      message: string;
      agentKey?: AgentKey;
      threadId?: string;
      context?: { type: string; id: string };
      stream?: boolean;
    } = {
      message: trimmed,
      agentKey,
      stream: useMainStreaming ? true : undefined,
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

    const isActiveGeneration = () => generationIdRef.current === generationId;

    try {
      if (useMainStreaming) {
        const deltaBatcher = createStreamDeltaBatcher(
          (content) => {
            if (!isActiveGeneration()) {
              return;
            }

            streamingContentRef.current = content;
            setStreamingAssistantContent(content);
            if (content.length > 0) {
              setLoading(false);
            }
          },
          () => streamingContentRef.current,
        );

        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: streamAbort.signal,
        });

        const streamResult = await consumeJarvisAssistantStream(response, {
          onThread: (nextThreadId) => {
            if (!isActiveGeneration()) {
              return;
            }

            setThreadId(nextThreadId);

            if (!initialThreadId && onThreadIdChange) {
              onThreadIdChange(
                nextThreadId,
                firstUserMessageRef.current ?? trimmed,
                { streaming: true },
              );
            }
          },
          onDelta: (delta) => {
            deltaBatcher.append(delta);
          },
          onReset: () => {
            deltaBatcher.reset();
          },
        });

        deltaBatcher.flushNow();

        if (!isActiveGeneration()) {
          return;
        }

        if (!streamResult.success) {
          throw new Error(streamResult.message);
        }

        streamingContentRef.current = streamResult.reply;
        setStreamingAssistantContent(streamResult.reply);
        setStreamingAssistantContent(null);
        streamingAssistantClientIdRef.current = null;
        setMessages((prev) => [
          ...prev,
          createCompletedAssistantMessage({
            clientId:
              streamingAssistantClientId ??
              createStreamingAssistantClientId(generationId),
            content: streamResult.reply,
          }),
        ]);

        return;
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

        if (!initialThreadId && onThreadIdChange) {
          onThreadIdChange(
            data.threadId,
            firstUserMessageRef.current ?? trimmed,
          );
        }
      }

      setMessages((prev) => [
        ...prev,
        createCompletedAssistantMessage({
          clientId: createClientMessageId(),
          content: data.reply ?? "",
        }),
      ]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      if (!isActiveGeneration()) {
        return;
      }

      setStreamingAssistantContent(null);
      streamingContentRef.current = "";
      streamingAssistantClientIdRef.current = null;
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      if (isActiveGeneration()) {
        setLoading(false);
        sendingRef.current = false;
      }
    }
  }

  async function loadOlderMessages() {
    if (!messagesApiPath || !hasOlder || loadingOlder || messages.length === 0) {
      return;
    }

    const oldestMessage = messages[0];

    if (!oldestMessage?.id || !oldestMessage.createdAt) {
      return;
    }

    const container = messagesContainerRef.current;
    const previousScrollHeight = container?.scrollHeight ?? 0;

    setLoadingOlder(true);

    try {
      const params = new URLSearchParams({
        beforeId: oldestMessage.id,
        beforeCreatedAt: oldestMessage.createdAt,
      });

      const response = await fetch(`${messagesApiPath}?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Could not load older messages.");
      }

      const data = (await response.json()) as {
        messages?: Array<{
          id: string;
          role: "user" | "assistant";
          content: string;
          createdAt: string;
        }>;
        hasOlder?: boolean;
      };

      const olderMessages = (data.messages ?? []).map((message) => ({
        id: message.id,
        clientId: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      }));

      setHasOlder(data.hasOlder === true);
      setMessages((current) => {
        const existingIds = new Set(current.map((message) => message.id).filter(Boolean));

        const dedupedOlder = olderMessages.filter(
          (message) => !existingIds.has(message.id),
        );

        return [...dedupedOlder, ...current];
      });

      requestAnimationFrame(() => {
        if (!container) {
          return;
        }

        container.scrollTop = container.scrollHeight - previousScrollHeight;
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load older messages.",
      );
    } finally {
      setLoadingOlder(false);
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
        <>
          {hasOlder ? (
            <div className="jarvis-load-older-wrap">
              <button
                type="button"
                className="jarvis-load-older"
                onClick={() => void loadOlderMessages()}
                disabled={loadingOlder}
              >
                {loadingOlder ? "Loading older messages…" : "Load older messages"}
              </button>
            </div>
          ) : null}
          {messages.map((message) => (
            <div
              key={getMessageRenderKey(message)}
              className={
                message.role === "user"
                  ? "jarvis-bubble jarvis-bubble--user"
                  : richAssistantResponses
                    ? "jarvis-bubble jarvis-bubble--assistant jarvis-bubble--assistant-rich"
                    : "jarvis-bubble jarvis-bubble--assistant"
              }
            >
              {message.role === "assistant" ? (
                <span className="jarvis-bubble-label">{displayName}</span>
              ) : null}
              {message.role === "assistant" && richAssistantResponses ? (
                <JarvisMarkdownResponse content={message.content} />
              ) : (
                <p className="jarvis-bubble-content">{message.content}</p>
              )}
            </div>
          ))}
          {streamingAssistantContent !== null &&
          streamingAssistantClientIdRef.current ? (
            <div
              key={streamingAssistantClientIdRef.current}
              className="jarvis-bubble jarvis-bubble--assistant jarvis-bubble--assistant-rich"
            >
              <span className="jarvis-bubble-label">{displayName}</span>
              <JarvisMarkdownResponse content={streamingAssistantContent} />
            </div>
          ) : null}
        </>
      )}

      {loading && streamingAssistantContent === null ? (
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

  if (isCompact && !isExpanded && messages.length === 0 && !loading) {
    return (
      <section
        className={`jarvis-panel jarvis-panel--compact${agentKey === "melusi" ? " jarvis-panel--melusi-compact" : ""}`}
        aria-label={`${displayName} assistant`}
      >
        <div className="jarvis-compact-inner">
          <div className="jarvis-compact-heading">
            <span className="jarvis-compact-label">{displayName}</span>
            <Link href={expandTarget} className="jarvis-compact-full-link">
              Full assistant
            </Link>
          </div>
          <p className="jarvis-compact-status">
            {compactStatusLine ??
              "Ask Jarvis about tasks, schedule, goals, and planning."}
          </p>
          <form
            onSubmit={handleSubmit}
            className="jarvis-compact-form"
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={`Ask ${displayName}…`}
              rows={1}
              maxLength={4000}
              disabled={loading}
              className="jarvis-compact-input"
              aria-label={`Message to ${displayName}`}
            />
            <button
              type="submit"
              disabled={loading || input.trim().length === 0}
              className="jarvis-compact-send"
              aria-label="Send message"
            >
              <SendIcon />
            </button>
            <button
              type="button"
              className="jarvis-compact-expand"
              onClick={handleCompactExpand}
              aria-label="Expand Jarvis conversation"
            >
              <ExpandIcon />
              Expand
            </button>
          </form>
        </div>
      </section>
    );
  }

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
            ref={messagesContainerRef}
            className="jarvis-messages jarvis-messages--full-page"
            aria-live="polite"
            aria-label="Conversation"
            onScroll={updateStickToBottom}
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
      className={`jarvis-panel jarvis-panel--embedded${isCompact ? " jarvis-panel--embedded-compact" : ""}${agentKey === "melusi" ? " jarvis-panel--melusi" : ""}`}
      aria-label={`${displayName} assistant`}
    >
      <div className="jarvis-panel-atmosphere" aria-hidden="true" />
      {isCompact ? (
        <button
          type="button"
          className="jarvis-expand-link jarvis-expand-link--button jarvis-collapse-link"
          onClick={handleCompactCollapse}
          aria-label="Collapse Jarvis conversation"
        >
          Collapse
        </button>
      ) : null}
      <Link href={expandTarget} className="jarvis-expand-link">
        <ExpandIcon />
        {isCompact ? "Full assistant" : "Expand"}
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
