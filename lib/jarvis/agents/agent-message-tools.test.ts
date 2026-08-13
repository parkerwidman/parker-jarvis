import { describe, expect, it } from "vitest";

import {
  buildConversationInput,
  RECENT_MESSAGES_LIMIT,
} from "@/lib/jarvis/agents/agent-message-tools";
import type { AgentMessageRecord } from "@/lib/jarvis/agents/types";

function buildHistory(
  entries: Array<{ role: "user" | "assistant"; content: string }>,
): AgentMessageRecord[] {
  return entries.map((entry, index) => ({
    id: `msg-${index + 1}`,
    role: entry.role,
    content: entry.content,
    createdAt: new Date(Date.UTC(2026, 7, 13, 12, index)).toISOString(),
  }));
}

describe("Main multi-turn conversation input", () => {
  it("includes prior clarification when user replies yes", () => {
    const history = buildHistory([
      {
        role: "user",
        content:
          "Add a recurring block called D7.6 Recurring Test every Tuesday from 12:30 to 1:00 PM.",
      },
      {
        role: "assistant",
        content:
          "Do you want me to add it to Fall 2026 starting Aug 25, or another schedule?",
      },
    ]);

    const input = buildConversationInput(history, "yes");

    expect(input).toEqual([
      {
        role: "user",
        content:
          "Add a recurring block called D7.6 Recurring Test every Tuesday from 12:30 to 1:00 PM.",
      },
      {
        role: "assistant",
        content:
          "Do you want me to add it to Fall 2026 starting Aug 25, or another schedule?",
      },
      { role: "user", content: "yes" },
    ]);
  });

  it("deduplicates the current user message when it is already persisted", () => {
    const history = buildHistory([
      { role: "user", content: "My appointment is Friday." },
      { role: "assistant", content: "Do you mean this Friday or next Friday?" },
      { role: "user", content: "This Friday." },
    ]);

    const input = buildConversationInput(history, "This Friday.");

    expect(input.at(-1)).toEqual({ role: "user", content: "This Friday." });
    expect(input.filter((message) => message.role === "user")).toHaveLength(2);
  });

  it("preserves repeated identical text on separate turns", () => {
    const history = buildHistory([
      { role: "user", content: "yes" },
      { role: "assistant", content: "Got it, option A." },
    ]);

    const input = buildConversationInput(history, "yes");

    expect(input.filter((message) => message.content === "yes")).toHaveLength(2);
  });

  it("exports a bounded recent message limit constant", () => {
    expect(RECENT_MESSAGES_LIMIT).toBe(20);
  });

  it("would only use the latest messages when history exceeds the model limit", () => {
    const longHistory = buildHistory(
      Array.from({ length: 25 }, (_, index) => ({
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        content: `Message ${index + 1}`,
      })),
    );

    expect(longHistory.length).toBeGreaterThan(RECENT_MESSAGES_LIMIT);
  });
});
