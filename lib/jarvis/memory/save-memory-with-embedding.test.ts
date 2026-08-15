import { describe, expect, it, vi } from "vitest";

import { saveMemoryWithEmbeddingIndex } from "@/lib/jarvis/memory/save-memory-with-embedding";

const mockSaveMemory = vi.fn();
const mockCreateMemoryEmbedding = vi.fn();
const mockStoreMemoryEmbedding = vi.fn();

vi.mock("@/lib/jarvis/tools/memory-tools", () => ({
  saveMemory: (...args: unknown[]) => mockSaveMemory(...args),
}));

vi.mock("@/lib/jarvis/memory/memory-embeddings", () => ({
  createMemoryEmbedding: (...args: unknown[]) => mockCreateMemoryEmbedding(...args),
}));

vi.mock("@/lib/jarvis/memory/memory-embedding-store", () => ({
  storeMemoryEmbedding: (...args: unknown[]) => mockStoreMemoryEmbedding(...args),
}));

describe("saveMemoryWithEmbeddingIndex", () => {
  it("indexes memory after explicit save", async () => {
    mockSaveMemory.mockResolvedValue({
      success: true,
      memory: {
        id: "mem-1",
        category: "preference",
        content: "I prefer Thursday for launches.",
        importance: 4,
        confirmed_by_user: true,
        created_at: "2026-08-01T00:00:00.000Z",
      },
    });
    mockCreateMemoryEmbedding.mockResolvedValue({
      embedding: Array.from({ length: 1536 }, () => 0.1),
      model: "text-embedding-3-small",
      dimensions: 1536,
      contentHash: "abc",
      inputTokens: 10,
    });
    mockStoreMemoryEmbedding.mockResolvedValue(true);

    const result = await saveMemoryWithEmbeddingIndex({} as never, "user-1", {
      content: "I prefer Thursday for launches.",
      category: "preference",
      importance: 4,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.embeddingIndexed).toBe(true);
    }
  });

  it("keeps saved memory when embedding indexing fails", async () => {
    mockSaveMemory.mockResolvedValue({
      success: true,
      memory: {
        id: "mem-2",
        category: "preference",
        content: "I prefer Thursday for launches.",
        importance: 4,
        confirmed_by_user: true,
        created_at: "2026-08-01T00:00:00.000Z",
      },
    });
    mockCreateMemoryEmbedding.mockRejectedValue(new Error("embedding down"));

    const result = await saveMemoryWithEmbeddingIndex({} as never, "user-1", {
      content: "I prefer Thursday for launches.",
      category: "preference",
      importance: 4,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.embeddingIndexed).toBe(false);
    }
  });
});

describe("no automatic learning", () => {
  it("does not expose any auto-save helper for ordinary chat text", async () => {
    const module = await import("@/lib/jarvis/memory/save-memory-with-embedding");

    expect(Object.keys(module)).toEqual([
      "saveMemoryWithEmbeddingIndex",
    ]);
  });
});
