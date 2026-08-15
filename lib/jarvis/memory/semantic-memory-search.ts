import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  JARVIS_MEMORY_EMBEDDING_DIMENSIONS,
  JARVIS_MEMORY_EMBEDDING_MODEL,
  SEMANTIC_MEMORY_MATCH_COUNT,
  SEMANTIC_MEMORY_MATCH_THRESHOLD,
} from "@/lib/jarvis/memory/memory-embedding-config";
import type { Memory } from "@/lib/jarvis/tools/memory-tools";

export type SemanticMemoryMatch = Memory & {
  similarity: number;
};

function formatEmbeddingForPostgres(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export async function matchJarvisMemoriesSemantic(input: {
  supabase: SupabaseClient;
  queryEmbedding: number[];
  matchCount?: number;
  matchThreshold?: number;
}): Promise<SemanticMemoryMatch[]> {
  if (input.queryEmbedding.length !== JARVIS_MEMORY_EMBEDDING_DIMENSIONS) {
    throw new Error("Query embedding has invalid dimensions.");
  }

  const { data, error } = await input.supabase.rpc("match_jarvis_memories", {
    query_embedding: formatEmbeddingForPostgres(input.queryEmbedding),
    match_count: input.matchCount ?? SEMANTIC_MEMORY_MATCH_COUNT,
    match_threshold: input.matchThreshold ?? SEMANTIC_MEMORY_MATCH_THRESHOLD,
    expected_embedding_model: JARVIS_MEMORY_EMBEDDING_MODEL,
  });

  if (error) {
    throw error;
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((row) => ({
    id: String(row.id),
    category: String(row.category),
    content: String(row.content),
    importance: Number(row.importance),
    confirmed_by_user: Boolean(row.confirmed_by_user),
    created_at: String(row.created_at),
    similarity: Number(row.similarity),
  }));
}
