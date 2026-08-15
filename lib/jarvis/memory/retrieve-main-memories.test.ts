import { afterEach, describe, expect, it, vi } from "vitest";

import { retrieveMainMemories } from "@/lib/jarvis/memory/retrieve-main-memories";
import type { Memory } from "@/lib/jarvis/tools/memory-tools";

const launchMemory: Memory = {
  id: "mem-launch",
  category: "preference",
  content:
    "I prefer Thursday launches because they give me more preparation time.",
  importance: 5,
  confirmed_by_user: true,
  created_at: "2026-08-01T00:00:00.000Z",
};

const mockCreateQueryEmbedding = vi.fn();
const mockMatchSemantic = vi.fn();
const mockLoadLexical = vi.fn();

vi.mock("@/lib/jarvis/memory/memory-embeddings", () => ({
  createQueryEmbedding: (...args: unknown[]) => mockCreateQueryEmbedding(...args),
}));

vi.mock("@/lib/jarvis/memory/semantic-memory-search", () => ({
  matchJarvisMemoriesSemantic: (...args: unknown[]) => mockMatchSemantic(...args),
}));

vi.mock("@/lib/jarvis/tools/memory-tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jarvis/tools/memory-tools")>();

  return {
    ...actual,
    loadLexicalMemoryCandidates: (...args: unknown[]) => mockLoadLexical(...args),
  };
});

describe("retrieveMainMemories", () => {
  afterEach(() => {
    mockCreateQueryEmbedding.mockReset();
    mockMatchSemantic.mockReset();
    mockLoadLexical.mockReset();
    delete process.env.JARVIS_MEMORY_LOGS;
  });

  it("uses lexical mode for general knowledge without embedding calls", async () => {
    mockLoadLexical.mockResolvedValue([launchMemory]);

    const result = await retrieveMainMemories({
      supabase: {} as never,
      userId: "user-1",
      currentMessage: "Explain compound interest.",
      rollingSummary: "",
      activeEntities: [],
      unresolvedQuestions: [],
      contextTarget: null,
    });

    expect(result.retrievalMode).toBe("lexical");
    expect(mockCreateQueryEmbedding).not.toHaveBeenCalled();
    expect(result.diagnostics.embeddingCalled).toBe(false);
  });

  it("retrieves semantically related memory across conversations in hybrid mode", async () => {
    mockLoadLexical.mockResolvedValue([]);
    mockCreateQueryEmbedding.mockResolvedValue({
      embedding: Array.from({ length: 1536 }, () => 0.1),
      model: "text-embedding-3-small",
      dimensions: 1536,
      inputTokens: 10,
    });
    mockMatchSemantic.mockResolvedValue([
      { ...launchMemory, similarity: 0.88 },
    ]);

    const result = await retrieveMainMemories({
      supabase: {} as never,
      userId: "user-1",
      currentMessage: "Which launch timing seems to fit my preferences?",
      rollingSummary: "",
      activeEntities: [],
      unresolvedQuestions: [],
      contextTarget: null,
    });

    expect(result.retrievalMode).toBe("hybrid");
    expect(mockCreateQueryEmbedding).toHaveBeenCalledTimes(1);
    expect(result.selected[0]?.id).toBe("mem-launch");
  });

  it("falls back to lexical retrieval when embedding fails", async () => {
    mockLoadLexical.mockResolvedValue([launchMemory]);
    mockCreateQueryEmbedding.mockRejectedValue(new Error("embedding failed"));

    const result = await retrieveMainMemories({
      supabase: {} as never,
      userId: "user-1",
      currentMessage: "What did I tell you before about launch timing?",
      rollingSummary: "",
      activeEntities: [],
      unresolvedQuestions: [],
      contextTarget: null,
    });

    expect(result.retrievalMode).toBe("hybrid");
    expect(result.selected.length).toBeGreaterThan(0);
  });

  it("logs safe memory diagnostics without memory text", async () => {
    process.env.JARVIS_MEMORY_LOGS = "1";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockLoadLexical.mockResolvedValue([]);

    await retrieveMainMemories({
      supabase: {} as never,
      userId: "user-1",
      currentMessage: "Explain compound interest.",
      rollingSummary: "",
      activeEntities: [],
      unresolvedQuestions: [],
      contextTarget: null,
      requestId: "req-memory",
    });

    const output = logSpy.mock.calls.flat().join(" ");
    expect(output).toContain("[JARVIS_MEMORY]");
    expect(output).toContain("retrievalMode=lexical");
    expect(output).not.toContain("Thursday launches");

    logSpy.mockRestore();
  });
});
