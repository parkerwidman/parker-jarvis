import { describe, expect, it } from "vitest";

import {
  CONTEXT_BUDGETS,
  estimateTokens,
  trimTextToTokenBudget,
} from "@/lib/jarvis/context-engine/context-budget";

describe("context budget", () => {
  it("estimates tokens conservatively from character length", () => {
    expect(estimateTokens("abcd")).toBeGreaterThan(0);
    expect(estimateTokens("a".repeat(400))).toBeGreaterThan(
      estimateTokens("a".repeat(100)),
    );
  });

  it("trims text to fit a token budget", () => {
    const longText = "word ".repeat(500);
    const trimmed = trimTextToTokenBudget(longText, 50);

    expect(trimmed.length).toBeLessThan(longText.length);
    expect(estimateTokens(trimmed)).toBeLessThanOrEqual(50);
  });

  it("defines named budget constants", () => {
    expect(CONTEXT_BUDGETS.recentConversation).toBe(3800);
    expect(CONTEXT_BUDGETS.relevantMemories).toBe(800);
  });
});
