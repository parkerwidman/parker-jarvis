import { describe, expect, it, vi } from "vitest";

import { matchJarvisMemoriesSemantic } from "@/lib/jarvis/memory/semantic-memory-search";

describe("matchJarvisMemoriesSemantic", () => {
  it("does not accept a caller-supplied user id and uses authenticated RPC context", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const supabase = { rpc } as never;

    await matchJarvisMemoriesSemantic({
      supabase,
      queryEmbedding: Array.from({ length: 1536 }, () => 0.01),
    });

    expect(rpc).toHaveBeenCalledWith(
      "match_jarvis_memories",
      expect.objectContaining({
        expected_embedding_model: "text-embedding-3-small",
      }),
    );

    const rpcArgs = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(rpcArgs).not.toHaveProperty("user_id");
    expect(rpcArgs).not.toHaveProperty("userId");
  });

  it("rejects invalid embedding dimensions before RPC", async () => {
    const rpc = vi.fn();
    const supabase = { rpc } as never;

    await expect(
      matchJarvisMemoriesSemantic({
        supabase,
        queryEmbedding: [0.1, 0.2],
      }),
    ).rejects.toThrow("invalid dimensions");

    expect(rpc).not.toHaveBeenCalled();
  });
});
