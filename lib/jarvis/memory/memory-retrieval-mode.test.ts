import { describe, expect, it } from "vitest";

import {
  buildMemoryRetrievalQuery,
  resolveMemoryRetrievalMode,
} from "@/lib/jarvis/memory/memory-retrieval-mode";

describe("memory retrieval mode", () => {
  it("GENERAL keeps lexical mode without embedding", () => {
    expect(
      resolveMemoryRetrievalMode({
        message: "Explain compound interest in three sentences.",
        contextTarget: null,
      }),
    ).toBe("lexical");
  });

  it("EXPLICIT RECALL uses hybrid mode", () => {
    expect(
      resolveMemoryRetrievalMode({
        message: "What did I tell you before about launch timing?",
        contextTarget: null,
      }),
    ).toBe("hybrid");
  });

  it("PERSONAL PREFERENCE uses hybrid mode", () => {
    expect(
      resolveMemoryRetrievalMode({
        message: "What kind of vacation vibe would probably suit me?",
        contextTarget: null,
      }),
    ).toBe("hybrid");
  });

  it("SCHEDULE read keeps lexical mode", () => {
    expect(
      resolveMemoryRetrievalMode({
        message: "What does my day tomorrow look like?",
        contextTarget: null,
      }),
    ).toBe("lexical");
  });

  it("planning fast path keeps lexical mode", () => {
    expect(
      resolveMemoryRetrievalMode({
        message: "What should I focus on tomorrow?",
        contextTarget: null,
      }),
    ).toBe("lexical");
  });

  it("TASK list keeps lexical mode", () => {
    expect(
      resolveMemoryRetrievalMode({
        message: "What tasks are open?",
        contextTarget: null,
      }),
    ).toBe("lexical");
  });

  it("builds compact referent-aware retrieval query", () => {
    const query = buildMemoryRetrievalQuery({
      currentMessage: "What did I say about that?",
      rollingSummary: "We discussed launch timing and Thursday preference.",
      activeEntities: [{ type: "topic", name: "launch timing" }],
      unresolvedQuestions: ["Which launch day fits best?"],
    });

    expect(query).toContain("What did I say about that?");
    expect(query).toContain("launch timing");
    expect(query.length).toBeLessThanOrEqual(2000);
  });
});
