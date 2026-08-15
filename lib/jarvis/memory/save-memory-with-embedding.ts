import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createMemoryEmbedding } from "@/lib/jarvis/memory/memory-embeddings";
import { storeMemoryEmbedding } from "@/lib/jarvis/memory/memory-embedding-store";
import type { Memory, SaveMemoryResult } from "@/lib/jarvis/tools/memory-tools";
import { saveMemory } from "@/lib/jarvis/tools/memory-tools";

export type SaveMemoryWithEmbeddingResult =
  | { success: true; memory: Memory; embeddingIndexed: boolean }
  | { success: false; error: string };

export async function saveMemoryWithEmbeddingIndex(
  supabase: SupabaseClient,
  userId: string,
  input: {
    content: string;
    category: string;
    importance: number;
  },
): Promise<SaveMemoryWithEmbeddingResult> {
  const saved: SaveMemoryResult = await saveMemory(supabase, userId, input);

  if (!saved.success) {
    return saved;
  }

  let embeddingIndexed = false;

  try {
    const embeddingResult = await createMemoryEmbedding({
      category: saved.memory.category,
      content: saved.memory.content,
      purpose: "memory_write",
    });

    embeddingIndexed = await storeMemoryEmbedding({
      supabase,
      userId,
      memoryId: saved.memory.id,
      category: saved.memory.category,
      content: saved.memory.content,
      embeddingResult,
    });
  } catch {
    embeddingIndexed = false;
  }

  return {
    success: true,
    memory: saved.memory,
    embeddingIndexed,
  };
}
