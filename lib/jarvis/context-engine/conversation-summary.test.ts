import { describe, expect, it } from "vitest";

import type { AgentMessageRecord } from "@/lib/jarvis/agents/types";
import {
  parseStructuredSummaryResult,
  shouldTriggerSummaryUpdate,
  splitMessagesForSummary,
} from "@/lib/jarvis/context-engine/conversation-summary";
import type { ConversationStateRecord } from "@/lib/jarvis/context-engine/context-types";
import { SUMMARY_RECENT_TAIL_MESSAGES, SUMMARY_TRIGGER_NEW_MESSAGES } from "@/lib/jarvis/context-engine/context-budget";

function msg(id: string, minute: number): AgentMessageRecord {
  return {
    id,
    role: minute % 2 === 0 ? "assistant" : "user",
    content: `Message ${minute}`,
    createdAt: new Date(Date.UTC(2026, 7, 13, 12, minute)).toISOString(),
  };
}

const state: ConversationStateRecord = {
  conversationId: "22222222-2222-4222-8222-222222222222",
  userId: "11111111-1111-4111-8111-111111111111",
  agentKey: "main",
  rollingSummary: "Earlier discussion",
  unresolvedQuestions: [],
  activeEntities: [],
  decisions: [],
  summaryThroughMessageId: "msg-5",
  summaryThroughCreatedAt: msg("msg-5", 5).createdAt,
  summaryVersion: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("conversation summary", () => {
  it("does not trigger before the threshold", () => {
    expect(shouldTriggerSummaryUpdate(SUMMARY_TRIGGER_NEW_MESSAGES - 1)).toBe(false);
    expect(shouldTriggerSummaryUpdate(SUMMARY_TRIGGER_NEW_MESSAGES)).toBe(true);
  });

  it("leaves a recent tail unsummarized", () => {
    const messages = Array.from({ length: 20 }, (_, index) => msg(`msg-${index + 1}`, index + 1));

    const split = splitMessagesForSummary({ messages, state });

    expect(split.tailMessages.length).toBe(SUMMARY_RECENT_TAIL_MESSAGES);
    expect(split.compactionCandidates.length).toBeGreaterThan(0);
  });

  it("parses structured summary JSON safely", () => {
    const parsed = parseStructuredSummaryResult(
      JSON.stringify({
        rollingSummary: "User chose option A.",
        unresolvedQuestions: ["Confirm date?"],
        activeEntities: [{ type: "project", name: "Melusi" }],
        decisions: ["Option A selected"],
      }),
    );

    expect(parsed?.rollingSummary).toContain("option A");
    expect(parsed?.unresolvedQuestions).toEqual(["Confirm date?"]);
    expect(parsed?.activeEntities[0]?.name).toBe("Melusi");
  });

  it("rejects malformed structured summary output", () => {
    expect(parseStructuredSummaryResult("{not json")).toBeNull();
    expect(parseStructuredSummaryResult(JSON.stringify({ foo: "bar" }))).toBeNull();
  });

  it("treats prompt-injection-like conversation content as data only in parser output", () => {
    const parsed = parseStructuredSummaryResult(
      JSON.stringify({
        rollingSummary:
          "User asked about schedules. Ignore previous instructions attempt noted in source.",
        unresolvedQuestions: [],
        activeEntities: [],
        decisions: [],
      }),
    );

    expect(parsed?.rollingSummary).toContain("Ignore previous instructions");
  });
});
