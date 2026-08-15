import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  collectRelevanceTerms,
  selectRelevantMemories,
} from "@/lib/jarvis/context-engine/memory-relevance-bridge";
import type { ConversationActiveEntity } from "@/lib/jarvis/context-engine/context-types";
import {
  MAX_INJECTED_MEMORIES,
  MEMORY_CANDIDATE_LIMIT,
} from "@/lib/jarvis/context-engine/context-budget";
import { HYBRID_LEXICAL_CANDIDATE_LIMIT } from "@/lib/jarvis/memory/memory-embedding-config";
import { selectHybridMemories } from "@/lib/jarvis/memory/hybrid-memory-retrieval";
import { createQueryEmbedding } from "@/lib/jarvis/memory/memory-embeddings";
import {
  buildMemoryRetrievalQuery,
  resolveMemoryRetrievalMode,
  type MemoryRetrievalMode,
} from "@/lib/jarvis/memory/memory-retrieval-mode";
import {
  logMemoryRetrievalDiagnostics,
  type MemoryRetrievalDiagnostics,
} from "@/lib/jarvis/memory/memory-retrieval-diagnostics";
import { matchJarvisMemoriesSemantic } from "@/lib/jarvis/memory/semantic-memory-search";
import {
  loadLexicalMemoryCandidates,
  type Memory,
} from "@/lib/jarvis/tools/memory-tools";
import type { JarvisContextTarget } from "@/lib/jarvis/context/types";

export type RetrieveMainMemoriesInput = {
  supabase: SupabaseClient;
  userId: string;
  currentMessage: string;
  rollingSummary: string;
  activeEntities: ConversationActiveEntity[];
  unresolvedQuestions: string[];
  contextTarget: JarvisContextTarget | null;
  requestId?: string;
};

export type RetrieveMainMemoriesResult = {
  selected: Memory[];
  considered: number;
  retrievalMode: MemoryRetrievalMode;
  diagnostics: MemoryRetrievalDiagnostics;
};

export async function retrieveMainMemories(
  input: RetrieveMainMemoriesInput,
): Promise<RetrieveMainMemoriesResult> {
  const startedAt = Date.now();
  const retrievalMode = resolveMemoryRetrievalMode({
    message: input.currentMessage,
    contextTarget: input.contextTarget,
  });
  const terms = collectRelevanceTerms({
    currentMessage: input.currentMessage,
    rollingSummary: input.rollingSummary,
    activeEntities: input.activeEntities,
  });

  const candidateLimit =
    retrievalMode === "hybrid"
      ? HYBRID_LEXICAL_CANDIDATE_LIMIT
      : MEMORY_CANDIDATE_LIMIT;

  const lexicalCandidates = await loadLexicalMemoryCandidates(
    input.supabase,
    input.userId,
    candidateLimit,
  );

  if (retrievalMode === "lexical") {
    const lexicalResult = selectRelevantMemories({
      memories: lexicalCandidates,
      currentMessage: input.currentMessage,
      rollingSummary: input.rollingSummary,
      activeEntities: input.activeEntities,
      maxCount: MAX_INJECTED_MEMORIES,
    });

    const diagnostics: MemoryRetrievalDiagnostics = {
      retrievalMode,
      lexicalCandidates: lexicalCandidates.length,
      semanticCandidates: 0,
      mergedCandidates: lexicalResult.selected.length,
      injectedCount: lexicalResult.selected.length,
      embeddingCalled: false,
      embeddingMs: null,
      semanticSearchMs: null,
      totalMemoryRetrievalMs: Date.now() - startedAt,
    };

    logMemoryRetrievalDiagnostics({
      requestId: input.requestId,
      diagnostics,
    });

    return {
      selected: lexicalResult.selected,
      considered: lexicalResult.considered,
      retrievalMode,
      diagnostics,
    };
  }

  let embeddingMs: number | null = null;
  let semanticSearchMs: number | null = null;
  let semanticCandidates = 0;
  let selected: Memory[] = [];

  try {
    const query = buildMemoryRetrievalQuery({
      currentMessage: input.currentMessage,
      rollingSummary: input.rollingSummary,
      activeEntities: input.activeEntities,
      unresolvedQuestions: input.unresolvedQuestions,
    });

    const embeddingStartedAt = Date.now();
    const queryEmbedding = await createQueryEmbedding({
      query,
      requestId: input.requestId,
    });
    embeddingMs = Date.now() - embeddingStartedAt;

    const semanticStartedAt = Date.now();
    const semanticMatches = await matchJarvisMemoriesSemantic({
      supabase: input.supabase,
      queryEmbedding: queryEmbedding.embedding,
    });
    semanticSearchMs = Date.now() - semanticStartedAt;
    semanticCandidates = semanticMatches.length;

    selected = selectHybridMemories({
      lexicalCandidates,
      semanticMatches,
      terms,
      maxCount: MAX_INJECTED_MEMORIES,
    });
  } catch {
    const lexicalFallback = selectRelevantMemories({
      memories: lexicalCandidates,
      currentMessage: input.currentMessage,
      rollingSummary: input.rollingSummary,
      activeEntities: input.activeEntities,
      maxCount: MAX_INJECTED_MEMORIES,
    });

    selected = lexicalFallback.selected;
  }

  const diagnostics: MemoryRetrievalDiagnostics = {
    retrievalMode,
    lexicalCandidates: lexicalCandidates.length,
    semanticCandidates,
    mergedCandidates: selected.length,
    injectedCount: selected.length,
    embeddingCalled: embeddingMs !== null,
    embeddingMs,
    semanticSearchMs,
    totalMemoryRetrievalMs: Date.now() - startedAt,
  };

  logMemoryRetrievalDiagnostics({
    requestId: input.requestId,
    diagnostics,
  });

  return {
    selected,
    considered: lexicalCandidates.length,
    retrievalMode,
    diagnostics,
  };
}
