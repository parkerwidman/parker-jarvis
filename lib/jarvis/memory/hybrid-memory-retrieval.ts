import "server-only";

import type { Memory } from "@/lib/jarvis/tools/memory-tools";
import {
  HYBRID_CONFIRMED_BOOST,
  HYBRID_IMPORTANCE_BOOST,
  HYBRID_RRF_K,
  HYBRID_SEMANTIC_SIMILARITY_WEIGHT,
} from "@/lib/jarvis/memory/memory-embedding-config";
import type { SemanticMemoryMatch } from "@/lib/jarvis/memory/semantic-memory-search";
import {
  rankLexicalMemories,
  type RankedLexicalMemory,
} from "@/lib/jarvis/context-engine/memory-relevance-bridge";

export type HybridRankedMemory = {
  memory: Memory;
  score: number;
  lexicalRank: number | null;
  semanticRank: number | null;
  semanticSimilarity: number | null;
};

/**
 * Reciprocal-rank fusion with deterministic tie-breakers.
 *
 * baseScore(memory) =
 *   (lexicalRank ? 1 / (k + lexicalRank) : 0)
 * + (semanticRank ? 1 / (k + semanticRank) : 0)
 * + (semanticSimilarity ? semanticSimilarity * HYBRID_SEMANTIC_SIMILARITY_WEIGHT : 0)
 * + (confirmed_by_user ? HYBRID_CONFIRMED_BOOST : 0)
 * + (importance * HYBRID_IMPORTANCE_BOOST)
 *
 * Lexical candidates with zero term overlap are excluded before fusion.
 *
 * Memories are deduplicated by durable memory ID before ranking.
 */
export function mergeHybridMemories(input: {
  lexicalRanked: RankedLexicalMemory[];
  semanticMatches: SemanticMemoryMatch[];
  maxCount: number;
}): HybridRankedMemory[] {
  const byId = new Map<string, HybridRankedMemory>();

  const lexicalRanked = input.lexicalRanked.filter((entry) => entry.overlap >= 1);

  for (const [index, entry] of lexicalRanked.entries()) {
    const rank = index + 1;
    const existing = byId.get(entry.memory.id);

    if (existing) {
      existing.lexicalRank = rank;
      continue;
    }

    byId.set(entry.memory.id, {
      memory: entry.memory,
      score: 0,
      lexicalRank: rank,
      semanticRank: null,
      semanticSimilarity: null,
    });
  }

  for (const [index, match] of input.semanticMatches.entries()) {
    const rank = index + 1;
    const existing = byId.get(match.id);

    if (existing) {
      existing.semanticRank = rank;
      existing.semanticSimilarity = match.similarity;
      continue;
    }

    byId.set(match.id, {
      memory: {
        id: match.id,
        category: match.category,
        content: match.content,
        importance: match.importance,
        confirmed_by_user: match.confirmed_by_user,
        created_at: match.created_at,
      },
      score: 0,
      lexicalRank: null,
      semanticRank: rank,
      semanticSimilarity: match.similarity,
    });
  }

  const ranked = [...byId.values()]
    .map((entry) => {
      const lexicalComponent = entry.lexicalRank
        ? 1 / (HYBRID_RRF_K + entry.lexicalRank)
        : 0;
      const semanticComponent = entry.semanticRank
        ? 1 / (HYBRID_RRF_K + entry.semanticRank)
        : 0;
      const similarityComponent =
        entry.semanticSimilarity !== null
          ? entry.semanticSimilarity * HYBRID_SEMANTIC_SIMILARITY_WEIGHT
          : 0;
      const confirmedComponent = entry.memory.confirmed_by_user
        ? HYBRID_CONFIRMED_BOOST
        : 0;
      const importanceComponent = entry.memory.importance * HYBRID_IMPORTANCE_BOOST;

      return {
        ...entry,
        score:
          lexicalComponent +
          semanticComponent +
          similarityComponent +
          confirmedComponent +
          importanceComponent,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.memory.importance !== left.memory.importance) {
        return right.memory.importance - left.memory.importance;
      }

      if (right.memory.confirmed_by_user !== left.memory.confirmed_by_user) {
        return Number(right.memory.confirmed_by_user) -
          Number(left.memory.confirmed_by_user);
      }

      return right.memory.created_at.localeCompare(left.memory.created_at);
    });

  return ranked.slice(0, input.maxCount);
}

export function selectHybridMemories(input: {
  lexicalCandidates: Memory[];
  semanticMatches: SemanticMemoryMatch[];
  terms: Set<string>;
  maxCount: number;
}): Memory[] {
  const lexicalRanked = rankLexicalMemories({
    memories: input.lexicalCandidates,
    terms: input.terms,
  }).filter((entry) => entry.overlap >= 1);

  return mergeHybridMemories({
    lexicalRanked,
    semanticMatches: input.semanticMatches,
    maxCount: input.maxCount,
  }).map((entry) => entry.memory);
}
