import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  JARVIS_MEMORY_EMBEDDING_MODEL,
  MEMORY_BACKFILL_BATCH_SIZE,
} from "@/lib/jarvis/memory/memory-embedding-config";
import { computeMemoryContentHash } from "@/lib/jarvis/memory/memory-content-hash";
import { createMemoryEmbeddingsBatch } from "@/lib/jarvis/memory/memory-embeddings";
import { storeMemoryEmbedding } from "@/lib/jarvis/memory/memory-embedding-store";

type BackfillCandidate = {
  id: string;
  category: string;
  content: string;
  embedding_model: string | null;
  embedding_content_hash: string | null;
};

export type BackfillMissingMemoryEmbeddingsResult = {
  scanned: number;
  indexed: number;
  failed: number;
};

function needsEmbeddingRefresh(candidate: BackfillCandidate): boolean {
  const expectedHash = computeMemoryContentHash({
    category: candidate.category,
    content: candidate.content,
  });

  return (
    candidate.embedding_model !== JARVIS_MEMORY_EMBEDDING_MODEL ||
    candidate.embedding_content_hash !== expectedHash
  );
}

export async function backfillMissingMemoryEmbeddings(input: {
  supabase: SupabaseClient;
  userId: string;
  batchSize?: number;
  requestId?: string;
}): Promise<BackfillMissingMemoryEmbeddingsResult> {
  const batchSize = input.batchSize ?? MEMORY_BACKFILL_BATCH_SIZE;

  const { data, error } = await input.supabase
    .from("memories")
    .select("id, category, content, embedding_model, embedding_content_hash")
    .eq("user_id", input.userId)
    .eq("active", true)
    .or(
      `embedding.is.null,embedding_model.neq.${JARVIS_MEMORY_EMBEDDING_MODEL},embedding_content_hash.is.null`,
    )
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(batchSize * 3);

  if (error || !data) {
    return { scanned: 0, indexed: 0, failed: 0 };
  }

  const candidates = (data as BackfillCandidate[])
    .filter((candidate) => needsEmbeddingRefresh(candidate))
    .slice(0, batchSize);

  if (candidates.length === 0) {
    return { scanned: 0, indexed: 0, failed: 0 };
  }

  let indexed = 0;
  let failed = 0;

  try {
    const embeddings = await createMemoryEmbeddingsBatch({
      items: candidates.map((candidate) => ({
        category: candidate.category,
        content: candidate.content,
      })),
      requestId: input.requestId,
    });

    for (const [index, candidate] of candidates.entries()) {
      const embeddingResult = embeddings[index];

      if (!embeddingResult) {
        failed += 1;
        continue;
      }

      const stored = await storeMemoryEmbedding({
        supabase: input.supabase,
        userId: input.userId,
        memoryId: candidate.id,
        category: candidate.category,
        content: candidate.content,
        embeddingResult,
      });

      if (stored) {
        indexed += 1;
      } else {
        failed += 1;
      }
    }
  } catch {
    failed = candidates.length;
  }

  return {
    scanned: candidates.length,
    indexed,
    failed,
  };
}
