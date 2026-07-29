"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = input.trim();
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

  return (
    <div className="flex w-full flex-col gap-4">
      <div
        className="flex min-h-[20rem] max-h-[32rem] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--navy-border)] bg-[var(--navy-surface)] p-4"
        aria-live="polite"
        aria-label="Conversation"
      >
        {messages.length === 0 && !loading ? (
          <p className="m-auto text-center text-sm text-[var(--navy-muted)]">
            Ask Jarvis anything to get started.
          </p>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={
                message.role === "user"
                  ? "ml-8 self-end rounded-xl rounded-br-sm bg-[var(--accent)] px-4 py-2.5 text-sm text-white"
                  : "mr-8 self-start rounded-xl rounded-bl-sm border border-[var(--navy-border)] bg-[var(--background)] px-4 py-2.5 text-sm text-[var(--foreground)]"
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
          placeholder="Message Jarvis…"
          rows={3}
          maxLength={4000}
          disabled={loading}
          className="resize-none rounded-lg border border-[var(--navy-border)] bg-[var(--navy-surface)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--navy-muted)] focus:border-[rgba(148,163,184,0.22)] focus:outline-none disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={loading || input.trim().length === 0}
          className="self-end rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
