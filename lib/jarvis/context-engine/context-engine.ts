import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildConversationInput,
} from "@/lib/jarvis/agents/agent-message-tools";
import {
  buildSelectedRecordSection,
  loadAssistantContext,
} from "@/lib/jarvis/context/load-assistant-context";
import { buildPendingScheduleActionSection } from "@/lib/jarvis/schedule/build-pending-schedule-section";
import { loadActiveMainPendingScheduleAction } from "@/lib/jarvis/schedule/pending-schedule-actions";
import { loadJarvisContext } from "@/lib/jarvis/tools/memory-tools";
import type { AgentMessageRecord } from "@/lib/jarvis/agents/types";
import {
  CONTEXT_BUDGETS,
  estimateTokens,
} from "@/lib/jarvis/context-engine/context-budget";
import {
  buildMainInstructions,
  extractActiveEntitiesFromState,
} from "@/lib/jarvis/context-engine/context-formatters";
import {
  collectRelevanceTerms,
  selectRelevantGoals,
  selectRelevantMemories,
} from "@/lib/jarvis/context-engine/memory-relevance-bridge";
import {
  isMessageAfterWatermark,
  loadConversationState,
} from "@/lib/jarvis/context-engine/conversation-state";
import {
  loadThreadMessagesForContext,
  validateSummaryWatermark,
} from "@/lib/jarvis/context-engine/load-context-messages";
import type {
  ContextEngineDiagnostics,
  MainContextEngineInput,
  MainContextEngineOutput,
} from "@/lib/jarvis/context-engine/context-types";

export function selectRecentMessagesWithinBudget(input: {
  messages: AgentMessageRecord[];
  watermark: { id: string; createdAt: string } | null;
  tokenBudget: number;
  sectionsTrimmed: string[];
}): AgentMessageRecord[] {
  const eligible = input.messages.filter((message) =>
    isMessageAfterWatermark(message, input.watermark),
  );

  if (eligible.length === 0) {
    return input.messages.slice(-1);
  }

  const selected: AgentMessageRecord[] = [];
  let usedTokens = 0;

  for (let index = eligible.length - 1; index >= 0; index -= 1) {
    const message = eligible[index];
    const messageTokens = estimateTokens(message.content);

    if (messageTokens > input.tokenBudget && selected.length > 0) {
      continue;
    }

    if (
      selected.length > 0 &&
      usedTokens + messageTokens > input.tokenBudget
    ) {
      input.sectionsTrimmed.push("recentConversation");
      break;
    }

    selected.unshift(message);
    usedTokens += messageTokens;
  }

  return selected.length > 0 ? selected : eligible.slice(-1);
}

export async function buildMainJarvisContext(
  supabase: SupabaseClient,
  input: MainContextEngineInput,
): Promise<MainContextEngineOutput> {
  const sectionsTrimmed: string[] = [];

  const [conversationState, jarvisContext, pendingAction, selectedRecord] =
    await Promise.all([
      input.threadId
        ? loadConversationState(supabase, input.userId, input.threadId)
        : Promise.resolve(null),
      loadJarvisContext(supabase, input.userId),
      loadActiveMainPendingScheduleAction(supabase, input.userId),
      input.contextTarget
        ? loadAssistantContext(supabase, input.userId, input.contextTarget)
        : Promise.resolve({ success: false as const }),
    ]);

  let watermark: { id: string; createdAt: string } | null = null;
  let recentMessages: AgentMessageRecord[] = [];

  if (input.threadId) {
    const rawWatermark =
      conversationState?.summaryThroughMessageId &&
      conversationState.summaryThroughCreatedAt
        ? {
            id: conversationState.summaryThroughMessageId,
            createdAt: conversationState.summaryThroughCreatedAt,
          }
        : null;

    watermark = rawWatermark
      ? await validateSummaryWatermark(
          supabase,
          input.userId,
          input.threadId,
          rawWatermark,
        )
      : null;

    recentMessages = await loadThreadMessagesForContext(
      supabase,
      input.userId,
      input.threadId,
      watermark,
    );
  }

  const boundedRecent = input.threadId
    ? selectRecentMessagesWithinBudget({
        messages: recentMessages,
        watermark,
        tokenBudget: CONTEXT_BUDGETS.recentConversation,
        sectionsTrimmed,
      })
    : [];

  const activeEntities = extractActiveEntitiesFromState(conversationState);
  const relevanceTerms = collectRelevanceTerms({
    currentMessage: input.currentMessage,
    rollingSummary: conversationState?.rollingSummary ?? "",
    activeEntities,
  });

  const { selected: selectedMemories, considered: memoriesConsidered } =
    selectRelevantMemories({
      memories: jarvisContext.memories,
      currentMessage: input.currentMessage,
      rollingSummary: conversationState?.rollingSummary ?? "",
      activeEntities,
    });

  const selectedGoals = selectRelevantGoals(jarvisContext.goals, relevanceTerms);

  const selectedRecordSection =
    selectedRecord.success
      ? buildSelectedRecordSection(selectedRecord.context)
      : "";

  const pendingScheduleSection = buildPendingScheduleActionSection({
    pendingAction,
    confirmationIntent: input.confirmationIntent,
  });

  const instructions = buildMainInstructions({
    jarvisContext,
    conversationState,
    selectedRecordSection,
    pendingScheduleSection,
    selectedGoals,
    selectedMemories,
    activeEntities,
    sectionsTrimmed,
  });

  const conversationInput = input.threadId
    ? buildConversationInput(boundedRecent, input.currentMessage)
    : [{ role: "user" as const, content: input.currentMessage.trim() }];

  const coreEstimatedTokens =
    estimateTokens(instructions.split("Conversation working state")[0] ?? instructions);
  const conversationInputEstimatedTokens = conversationInput.reduce(
    (total, message) => total + estimateTokens(message.content),
    0,
  );
  const optionalContextEstimatedTokens = Math.max(
    0,
    estimateTokens(instructions) - coreEstimatedTokens,
  );

  const diagnostics: ContextEngineDiagnostics = {
    recentMessageCount: boundedRecent.length,
    recentEstimatedTokens: boundedRecent.reduce(
      (total, message) => total + estimateTokens(message.content),
      0,
    ),
    summaryIncluded: Boolean(conversationState?.rollingSummary.trim()),
    summaryEstimatedTokens: conversationState?.rollingSummary
      ? estimateTokens(conversationState.rollingSummary)
      : 0,
    goalsIncluded: selectedGoals.length,
    memoriesConsidered,
    memoriesIncluded: selectedMemories.length,
    coreEstimatedTokens,
    optionalContextEstimatedTokens,
    conversationInputEstimatedTokens,
    estimatedContextTokens:
      estimateTokens(instructions) + conversationInputEstimatedTokens,
    sectionsTrimmed,
  };

  return {
    instructions,
    conversationInput,
    diagnostics,
    conversationState,
    recentMessages: boundedRecent,
  };
}

export function estimateLegacyMainContextTokens(input: {
  instructions: string;
  conversationInput: Array<{ role: "user" | "assistant"; content: string }>;
}): number {
  return (
    estimateTokens(input.instructions) +
    input.conversationInput.reduce(
      (total, message) => total + estimateTokens(message.content),
      0,
    )
  );
}
