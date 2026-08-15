import { describe, expect, it } from "vitest";

import { resolveMemoryRetrievalMode } from "@/lib/jarvis/memory/memory-retrieval-mode";
import { evaluateReadFastPath } from "@/lib/jarvis/agents/read-fast-path";

describe("read fast path memory retrieval protection", () => {
  const baseFastPathInput = {
    confirmationIntent: "unknown" as const,
    pendingAction: null,
    contextTarget: null,
    timeZone: "America/Chicago",
    now: new Date("2026-08-13T18:00:00.000Z"),
  };

  it("keeps schedule fast path eligible without requiring hybrid memory", () => {
    const message = "What does my day tomorrow look like?";

    expect(
      resolveMemoryRetrievalMode({
        message,
        contextTarget: null,
      }),
    ).toBe("lexical");

    expect(
      evaluateReadFastPath({
        ...baseFastPathInput,
        message,
      }).eligible,
    ).toBe(true);
  });

  it("keeps planning fast path eligible without requiring hybrid memory", () => {
    const message = "What should I focus on tomorrow?";

    expect(
      resolveMemoryRetrievalMode({
        message,
        contextTarget: null,
      }),
    ).toBe("lexical");

    expect(
      evaluateReadFastPath({
        ...baseFastPathInput,
        message,
      }).eligible,
    ).toBe(true);
  });
});
