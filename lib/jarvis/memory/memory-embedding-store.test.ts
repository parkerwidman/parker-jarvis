import { describe, expect, it, vi } from "vitest";

import { storeMemoryEmbedding } from "@/lib/jarvis/memory/memory-embedding-store";
import { computeMemoryContentHash } from "@/lib/jarvis/memory/memory-content-hash";

function createSupabaseMock(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ maybeSingle });
  const eqChain = {
    eq: vi.fn().mockReturnThis(),
    select,
  };

  const update = vi.fn().mockReturnValue(eqChain);

  return {
    supabase: {
      from: vi.fn().mockReturnValue({ update }),
    } as never,
    update,
    maybeSingle,
  };
}

describe("storeMemoryEmbedding", () => {
  const baseInput = {
    userId: "user-1",
    memoryId: "memory-1",
    category: "preference",
    content: "I prefer Thursday launches.",
    embeddingResult: {
      embedding: Array.from({ length: 1536 }, () => 0.01),
      model: "text-embedding-3-small",
      dimensions: 1536,
      contentHash: computeMemoryContentHash({
        category: "preference",
        content: "I prefer Thursday launches.",
      }),
      inputTokens: 12,
    },
  };

  it("updates only when category and content still match", async () => {
    const { supabase, update } = createSupabaseMock({
      data: { id: "memory-1" },
      error: null,
    });

    const stored = await storeMemoryEmbedding({
      supabase,
      ...baseInput,
    });

    expect(stored).toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        embedding_model: "text-embedding-3-small",
      }),
    );

    const chain = update.mock.results[0]?.value;
    expect(chain.eq).toHaveBeenCalledWith("category", "preference");
    expect(chain.eq).toHaveBeenCalledWith("content", "I prefer Thursday launches.");
  });

  it("returns false when embedding hash does not match canonical content hash", async () => {
    const { supabase, update } = createSupabaseMock({
      data: { id: "memory-1" },
      error: null,
    });

    const stored = await storeMemoryEmbedding({
      supabase,
      ...baseInput,
      embeddingResult: {
        ...baseInput.embeddingResult,
        contentHash: "0".repeat(64),
      },
    });

    expect(stored).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns false when conditional update matches zero rows", async () => {
    const { supabase } = createSupabaseMock({
      data: null,
      error: null,
    });

    const stored = await storeMemoryEmbedding({
      supabase,
      ...baseInput,
    });

    expect(stored).toBe(false);
  });
});
