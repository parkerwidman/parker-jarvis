import type { Memory } from "@/lib/jarvis/tools/memory-tools";
import type { ConversationActiveEntity } from "@/lib/jarvis/context-engine/context-types";
import {
  MAX_INJECTED_MEMORIES,
  MEMORY_CANDIDATE_LIMIT,
  MEMORY_FALLBACK_COUNT,
} from "@/lib/jarvis/context-engine/context-budget";

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "is",
  "it",
  "that",
  "this",
  "with",
  "as",
  "at",
  "be",
  "by",
  "from",
  "what",
  "which",
  "who",
  "how",
  "when",
  "where",
  "why",
  "yes",
  "no",
  "my",
  "me",
  "i",
  "you",
  "we",
  "do",
  "did",
  "was",
  "were",
  "are",
  "about",
]);

export function tokenizeForRelevance(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
  );
}

export function collectRelevanceTerms(input: {
  currentMessage: string;
  rollingSummary: string;
  activeEntities: ConversationActiveEntity[];
}): Set<string> {
  const terms = new Set<string>();

  for (const token of tokenizeForRelevance(input.currentMessage)) {
    terms.add(token);
  }

  for (const token of tokenizeForRelevance(input.rollingSummary)) {
    terms.add(token);
  }

  for (const entity of input.activeEntities) {
    for (const token of tokenizeForRelevance(`${entity.type} ${entity.name}`)) {
      terms.add(token);
    }
  }

  return terms;
}

function computeLexicalOverlap(memory: Memory, terms: Set<string>): number {
  const memoryTokens = tokenizeForRelevance(memory.content);
  let overlap = 0;

  for (const term of terms) {
    if (memoryTokens.has(term)) {
      overlap += 1;
    }
  }

  return overlap;
}

function scoreMemory(
  memory: Memory,
  terms: Set<string>,
): number {
  const overlap = computeLexicalOverlap(memory, terms);
  const confirmedBoost = memory.confirmed_by_user ? 2 : 0;
  const importanceBoost = memory.importance * 0.75;

  return overlap * 4 + confirmedBoost + importanceBoost;
}

export type RankedLexicalMemory = {
  memory: Memory;
  score: number;
  overlap: number;
};

export function rankLexicalMemories(input: {
  memories: Memory[];
  terms: Set<string>;
}): RankedLexicalMemory[] {
  return input.memories
    .map((memory) => ({
      memory,
      score: scoreMemory(memory, input.terms),
      overlap: computeLexicalOverlap(memory, input.terms),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.memory.importance !== left.memory.importance) {
        return right.memory.importance - left.memory.importance;
      }

      return right.memory.created_at.localeCompare(left.memory.created_at);
    });
}

export function selectRelevantMemories(input: {
  memories: Memory[];
  currentMessage: string;
  rollingSummary: string;
  activeEntities: ConversationActiveEntity[];
  maxCount?: number;
}): { selected: Memory[]; considered: number } {
  const candidates = input.memories.slice(0, MEMORY_CANDIDATE_LIMIT);
  const terms = collectRelevanceTerms({
    currentMessage: input.currentMessage,
    rollingSummary: input.rollingSummary,
    activeEntities: input.activeEntities,
  });
  const maxCount = input.maxCount ?? MAX_INJECTED_MEMORIES;

  const ranked = rankLexicalMemories({
    memories: candidates,
    terms,
  });

  const relevant = ranked
    .filter((entry) => entry.overlap >= 1)
    .map((entry) => entry.memory);

  if (relevant.length > 0) {
    return {
      selected: relevant.slice(0, maxCount),
      considered: candidates.length,
    };
  }

  const fallback = candidates
    .slice()
    .sort((left, right) => {
      const leftScore =
        left.importance + (left.confirmed_by_user ? 2 : 0);
      const rightScore =
        right.importance + (right.confirmed_by_user ? 2 : 0);

      return rightScore - leftScore;
    })
    .slice(0, MEMORY_FALLBACK_COUNT);

  return {
    selected: fallback,
    considered: candidates.length,
  };
}

export function selectRelevantGoals<T extends {
  title: string;
  description: string | null;
  status: string;
  priority: string;
}>(
  goals: T[],
  terms: Set<string>,
  maxCount = 8,
): T[] {
  const ranked = goals
    .map((goal) => {
      const haystack = `${goal.title} ${goal.description ?? ""}`.toLowerCase();
      let score = 0;

      for (const term of terms) {
        if (haystack.includes(term)) {
          score += 2;
        }
      }

      if (goal.status === "active") {
        score += 1;
      }

      if (goal.priority === "high") {
        score += 1;
      }

      return { goal, score };
    })
    .sort((left, right) => right.score - left.score);

  const relevant = ranked.filter((entry) => entry.score > 0).map((entry) => entry.goal);

  if (relevant.length > 0) {
    return relevant.slice(0, maxCount);
  }

  return goals
    .filter((goal) => goal.status === "active")
    .slice()
    .sort((left, right) => left.title.localeCompare(right.title))
    .slice(0, maxCount);
}
