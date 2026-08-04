"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const EXAMPLE_PROMPTS = [
  "What should I prioritize today?",
  "Show my overdue tasks.",
  "Mark a task complete.",
  "Summarize my upcoming schedule.",
  "Draft a response to an important email.",
] as const;

type JarvisChatProps = {
  variant?: "embedded" | "fullPage";
};

export function JarvisChat({ variant = "fullPage" }: JarvisChatProps) {
  const isEmbedded = variant === "embedded";
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
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
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

  function handleExamplePrompt(prompt: string) {
    void sendMessage(prompt);
  }

  const messageAreaClasses = isEmbedded
    ? "flex min-h-[22rem] max-h-[36rem] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--navy-border)] bg-[var(--background)] p-4"
    : "flex min-h-[20rem] max-h-[32rem] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--navy-border)] bg-[var(--navy-surface)] p-4";

  const chatContent = (
    <>
      <div
        className={messageAreaClasses}
        aria-live="polite"
        aria-label="Conversation"
      >
        {messages.length === 0 && !loading ? (
          isEmbedded ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6">
              <p className="text-center text-sm text-[var(--navy-muted)]">
                What should we work on?
              </p>
              <div className="flex w-full flex-wrap justify-center gap-2">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleExamplePrompt(prompt)}
                    disabled={loading}
                    className="rounded-full border border-[var(--navy-border)] bg-[var(--navy-surface)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition-colors hover:border-[rgba(59,130,246,0.35)] hover:bg-[#151f33] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="m-auto text-center text-sm text-[var(--navy-muted)]">
              Ask Jarvis anything to get started.
            </p>
          )
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={
                message.role === "user"
                  ? "ml-8 self-end rounded-xl rounded-br-sm bg-[var(--accent)] px-4 py-2.5 text-sm text-white"
                  : "mr-8 self-start rounded-xl rounded-bl-sm border border-[var(--navy-border)] bg-[var(--navy-surface)] px-4 py-2.5 text-sm text-[var(--foreground)]"
              }
            >
              {message.role === "assistant" ? (
                <span className="mb-1 block text-xs font-medium text-[var(--navy-muted)]">
                  Jarvis
                </span>
              ) : null}
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          ))
        )}

        {loading ? (
          <p className="mr-8 self-start text-sm text-[var(--navy-muted)]">
            Jarvis is thinking…
          </p>
        ) : null}

        <div ref={messagesEndRef} />
      </div>

      {error ? (
        <p className="text-center text-sm text-red-400">{error}</p>
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={isEmbedded ? "Ask Jarvis…" : "Message Jarvis…"}
          rows={isEmbedded ? 2 : 3}
          maxLength={4000}
          disabled={loading}
          className="resize-none rounded-lg border border-[var(--navy-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--navy-muted)] focus:border-[rgba(148,163,184,0.22)] focus:outline-none disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={loading || input.trim().length === 0}
          className="self-end rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </>
  );

  if (!isEmbedded) {
    return <div className="flex w-full flex-col gap-4">{chatContent}</div>;
  }

  return (
    <section
      className="flex w-full flex-col gap-4 rounded-xl border border-[rgba(59,130,246,0.2)] bg-[var(--navy-surface)] p-5 shadow-[0_0_40px_rgba(59,130,246,0.06)]"
      aria-label="Jarvis assistant"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgba(59,130,246,0.35)] bg-[rgba(59,130,246,0.1)]"
            aria-hidden="true"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent-glow)]" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[var(--foreground)]">
              Ask Jarvis
            </h2>
            <p className="mt-0.5 text-xs text-[var(--navy-muted)]">
              Your personal assistant — tasks, schedule, email, and goals.
            </p>
          </div>
        </div>
        <Link
          href="/assistant"
          className="rounded-lg border border-[var(--navy-border)] bg-[var(--background)] px-3 py-1.5 text-xs font-medium text-[var(--navy-muted)] transition-colors hover:border-[rgba(59,130,246,0.35)] hover:text-[var(--foreground)] no-underline"
        >
          Expand
        </Link>
      </div>

      {chatContent}
    </section>
  );
}
