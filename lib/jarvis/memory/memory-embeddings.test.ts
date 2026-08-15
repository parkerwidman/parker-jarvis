import { afterEach, describe, expect, it, vi } from "vitest";

import { JARVIS_MEMORY_EMBEDDING_DIMENSIONS } from "@/lib/jarvis/memory/memory-embedding-config";
import {
  createMemoryEmbedding,
  createQueryEmbedding,
  validateEmbeddingVector,
} from "@/lib/jarvis/memory/memory-embeddings";

const mockCreate = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    embeddings: {
      create: mockCreate,
    },
  })),
}));

function vector(value = 0.1): number[] {
  return Array.from({ length: JARVIS_MEMORY_EMBEDDING_DIMENSIONS }, () => value);
}

describe("memory embeddings service", () => {
  afterEach(() => {
    mockCreate.mockReset();
    delete process.env.JARVIS_USAGE_LOGS;
  });

  it("validates embedding dimensions", () => {
    expect(() => validateEmbeddingVector([1, 2, 3])).toThrow(
      /dimension mismatch/i,
    );
    expect(() => validateEmbeddingVector(vector())).not.toThrow();
  });

  it("creates query embeddings with usage logging metadata", async () => {
    process.env.JARVIS_USAGE_LOGS = "1";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    mockCreate.mockResolvedValue({
      model: "text-embedding-3-small",
      data: [{ embedding: vector(), index: 0 }],
      usage: { prompt_tokens: 12, total_tokens: 12 },
    });

    const result = await createQueryEmbedding({
      query: "Which launch timing fits my preferences?",
      requestId: "req-1",
    });

    expect(result.embedding).toHaveLength(JARVIS_MEMORY_EMBEDDING_DIMENSIONS);
    expect(mockCreate).toHaveBeenCalledTimes(1);

    const output = logSpy.mock.calls.flat().join(" ");
    expect(output).toContain("[JARVIS_USAGE_EMBEDDING]");
    expect(output).toContain("purpose=query");
    expect(output).not.toContain("Thursday launches");

    logSpy.mockRestore();
  });

  it("creates memory embeddings with content hash", async () => {
    mockCreate.mockResolvedValue({
      model: "text-embedding-3-small",
      data: [{ embedding: vector(0.2), index: 0 }],
      usage: { prompt_tokens: 18, total_tokens: 18 },
    });

    const result = await createMemoryEmbedding({
      category: "preference",
      content: "I prefer Thursday launches.",
    });

    expect(result.contentHash).toHaveLength(64);
    expect(result.dimensions).toBe(JARVIS_MEMORY_EMBEDDING_DIMENSIONS);
  });
});
