export const CONTEXT_BUDGETS = {
  conversationSummary: 800,
  workingStateMetadata: 350,
  recentConversation: 3800,
  profileLifeContext: 750,
  activeGoals: 600,
  relevantMemories: 800,
  pendingActions: 300,
  selectedRecord: 600,
} as const;

export const TOTAL_OPTIONAL_CONTEXT_TOKEN_BUDGET = 12000;

export const CONTEXT_MESSAGE_LOAD_LIMIT = 50;
export const SUMMARY_TRIGGER_NEW_MESSAGES = 12;
export const SUMMARY_RECENT_TAIL_MESSAGES = 8;

export const MAX_INJECTED_MEMORIES = 10;
export const MEMORY_CANDIDATE_LIMIT = 50;
export const MEMORY_FALLBACK_COUNT = 2;

const STRUCTURAL_OVERHEAD_TOKENS = 8;

export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  return Math.ceil(text.length / 3.5) + STRUCTURAL_OVERHEAD_TOKENS;
}

export function trimTextToTokenBudget(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) {
    return text;
  }

  let low = 0;
  let high = text.length;
  let best = "";

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = text.slice(0, mid).trimEnd();

    if (estimateTokens(candidate) <= maxTokens) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (best.length === 0) {
    return text.slice(0, Math.max(1, Math.floor(maxTokens * 3.5))).trimEnd();
  }

  if (best.endsWith("…")) {
    return best;
  }

  let result = best.length > 0 ? `${best}…` : best;

  while (result.length > 0 && estimateTokens(result) > maxTokens) {
    result = result.slice(0, -2).trimEnd();

    if (result.length > 0 && !result.endsWith("…")) {
      result = `${result}…`;
    }
  }

  return result;
}

export function sumEstimatedTokens(parts: string[]): number {
  return parts.reduce((total, part) => total + estimateTokens(part), 0);
}
