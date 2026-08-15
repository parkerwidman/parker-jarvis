import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { computeMemoryContentHash } from "@/lib/jarvis/memory/memory-content-hash";
import type { MemoryEmbeddingResult } from "@/lib/jarvis/memory/memory-embeddings";

function formatEmbeddingForPostgres(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export async function storeMemoryEmbedding(input: {
  supabase: SupabaseClient;
  userId: string;
  memoryId: string;
  category: string;
  content: string;
  embeddingResult: MemoryEmbeddingResult;
}): Promise<boolean> {
  const expectedHash = computeMemoryContentHash({
    category: input.category,
    content: input.content,
  });

  if (expectedHash !== input.embeddingResult.contentHash) {
    return false;
  }

  const { data: updated, error } = await input.supabase
    .from("memories")
    .update({
      embedding: formatEmbeddingForPostgres(input.embeddingResult.embedding),
      embedding_model: input.embeddingResult.model,
      embedding_content_hash: input.embeddingResult.contentHash,
      embedded_at: new Date().toISOString(),
    })
    .eq("id", input.memoryId)
    .eq("user_id", input.userId)
    .eq("active", true)
    .eq("category", input.category)
    .eq("content", input.content)
    .select("id")
    .maybeSingle();

  return !error && updated !== null;
}

export async function clearMemoryEmbedding(input: {
  supabase: SupabaseClient;
  userId: string;
  memoryId: string;
}): Promise<void> {
  await input.supabase
    .from("memories")
    .update({
      embedding: null,
      embedding_model: null,
      embedding_content_hash: null,
      embedded_at: null,
    })
    .eq("id", input.memoryId)
    .eq("user_id", input.userId);
}
