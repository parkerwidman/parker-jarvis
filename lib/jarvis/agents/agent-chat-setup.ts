import "server-only";

import type OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JarvisContextTarget } from "@/lib/jarvis/context/types";
import { buildSelectedRecordSection, loadAssistantContext } from "@/lib/jarvis/context/load-assistant-context";
import { loadJarvisContext } from "@/lib/jarvis/tools/memory-tools";
import {
  buildConversationInput,
  loadRecentThreadMessages,
  persistAgentMessage,
} from "./agent-message-tools";
import { validateThreadAgentConsistency } from "./agent-thread-tools";
import { buildAgentInstructions } from "./instruction-builder";
import { buildMainJarvisContext } from "@/lib/jarvis/context-engine/context-engine";
import { buildJarvisRequestUsageMetadata } from "@/lib/jarvis/performance/model-usage";
import { resolveMainJarvisToolExposure } from "@/lib/jarvis/agents/dynamic-tool-exposure";
import { detectScheduleConfirmationIntent } from "@/lib/jarvis/schedule/schedule-confirmation-intent";
import { loadActiveMainPendingScheduleAction } from "@/lib/jarvis/schedule/pending-schedule-actions";
import {
  resolveMelusiThreadForMessage,
} from "./agent-thread-tools";
import { resolveMainThreadForMessage } from "@/lib/jarvis/conversations/main-conversation-tools";
import type { JarvisRequestUsageMetadata } from "@/lib/jarvis/performance/model-usage";
import type { RequestPerformanceCollector } from "@/lib/jarvis/performance/request-performance";
import { getToolsForAgent } from "./tool-definitions";
import type { AgentKey, MelusiThreadType } from "./types";
import type { PendingScheduleActionRecord } from "@/lib/jarvis/schedule/pending-schedule-action-types";
import type { ScheduleConfirmationIntent } from "@/lib/jarvis/schedule/schedule-confirmation-intent";

export type MainAgentTurnContext = {
  timeZone: string;
  confirmationIntent: ScheduleConfirmationIntent;
  pendingAction: PendingScheduleActionRecord | null;
};

export type PreparedAgentChatTurn = {
  activeThreadId: string;
  instructions: string;
  input: OpenAI.Responses.ResponseInput;
  tools: OpenAI.Responses.Tool[];
  agentKey: AgentKey;
  melusiThreadType?: MelusiThreadType;
  usageMetadata: JarvisRequestUsageMetadata;
  mainTurnContext?: MainAgentTurnContext;
};

export type PrepareAgentChatTurnParams = {
  supabase: SupabaseClient;
  userId: string;
  message: string;
  agentKey: AgentKey;
  threadId: string | null;
  contextTarget: JarvisContextTarget | null;
  performance?: RequestPerformanceCollector;
};

export type PrepareAgentChatTurnResult =
  | { success: true; prepared: PreparedAgentChatTurn }
  | { success: false; error: string; status: number };

export async function prepareAgentChatTurn(
  params: PrepareAgentChatTurnParams,
): Promise<PrepareAgentChatTurnResult> {
  const { supabase, userId, message, agentKey, threadId, contextTarget, performance } =
    params;
  let tools = getToolsForAgent(agentKey);
  let toolRoutingReason: string | undefined;

  let activeThreadId: string | null = threadId;
  let melusiThreadType: MelusiThreadType | undefined;

  if (agentKey === "melusi") {
    const threadResult = await resolveMelusiThreadForMessage(
      supabase,
      userId,
      threadId,
    );

    if (!threadResult.success) {
      return { success: false, error: threadResult.error, status: 400 };
    }

    if (!validateThreadAgentConsistency(threadResult.thread, agentKey)) {
      return { success: false, error: "Thread not found.", status: 404 };
    }

    activeThreadId = threadResult.thread.id;
    melusiThreadType = threadResult.thread.threadType as MelusiThreadType;
    performance?.mark("thread_resolved");

    const userPersist = await persistAgentMessage(
      supabase,
      userId,
      activeThreadId,
      agentKey,
      "user",
      message,
    );

    if (!userPersist.success) {
      return { success: false, error: userPersist.error, status: 400 };
    }

    performance?.mark("user_message_persisted");
  } else if (agentKey === "main") {
    const threadResult = await resolveMainThreadForMessage(
      supabase,
      userId,
      threadId,
      message,
    );

    if (!threadResult.success) {
      return { success: false, error: threadResult.error, status: 404 };
    }

    if (!validateThreadAgentConsistency(threadResult.thread, agentKey)) {
      return { success: false, error: "Conversation not found.", status: 404 };
    }

    activeThreadId = threadResult.thread.id;
    performance?.mark("thread_resolved");

    const userPersist = await persistAgentMessage(
      supabase,
      userId,
      activeThreadId,
      agentKey,
      "user",
      message,
    );

    if (!userPersist.success) {
      if (!threadId) {
        await supabase
          .from("agent_threads")
          .delete()
          .eq("id", activeThreadId)
          .eq("user_id", userId)
          .eq("agent_key", "main");
      }

      return { success: false, error: userPersist.error, status: 400 };
    }

    performance?.mark("user_message_persisted");
  } else {
    return { success: false, error: "Unsupported agent.", status: 400 };
  }

  let instructions = "";
  let historyMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
  let usageMetadata = buildJarvisRequestUsageMetadata({ tools });

  if (agentKey === "main") {
    const pendingAction = await loadActiveMainPendingScheduleAction(
      supabase,
      userId,
    );
    const confirmationIntent = detectScheduleConfirmationIntent(message);
    const toolExposure = resolveMainJarvisToolExposure({
      message,
      confirmationIntent,
      pendingAction,
      contextTarget,
    });

    tools = toolExposure.tools;
    toolRoutingReason = toolExposure.routingReason;

    performance?.mark("context_start");
    const contextPackage = await buildMainJarvisContext(supabase, {
      userId,
      threadId: activeThreadId,
      currentMessage: message,
      contextTarget,
      confirmationIntent,
    });
    performance?.mark("context_complete");

    instructions = contextPackage.instructions;
    historyMessages = contextPackage.conversationInput;
    usageMetadata = buildJarvisRequestUsageMetadata({
      tools,
      diagnostics: contextPackage.diagnostics,
      sectionEstimates: contextPackage.sectionEstimates,
      toolRoutingReason,
    });

    if (historyMessages.length === 0) {
      return { success: false, error: "Invalid message content.", status: 400 };
    }

    return {
      success: true,
      prepared: {
        activeThreadId,
        instructions,
        input: historyMessages.map((item) => ({
          role: item.role,
          content: item.content,
        })),
        tools,
        agentKey,
        usageMetadata,
        mainTurnContext: {
          timeZone: contextPackage.timeZone,
          confirmationIntent,
          pendingAction,
        },
      },
    };
  } else {
    performance?.mark("context_start");
    const jarvisContext = await loadJarvisContext(supabase, userId);

    let selectedRecordSection = "";

    if (contextTarget) {
      const selectedRecord = await loadAssistantContext(
        supabase,
        userId,
        contextTarget,
      );

      if (selectedRecord.success) {
        selectedRecordSection = buildSelectedRecordSection(
          selectedRecord.context,
        );
      }
    }

    instructions = buildAgentInstructions(
      agentKey,
      jarvisContext,
      selectedRecordSection,
      melusiThreadType,
      "",
    );

    const recentMessages = await loadRecentThreadMessages(
      supabase,
      userId,
      activeThreadId,
      undefined,
      agentKey,
    );

    historyMessages = buildConversationInput(recentMessages, message);

    if (historyMessages.length === 0) {
      return { success: false, error: "Invalid message content.", status: 400 };
    }

    performance?.mark("context_complete");
  }

  const input: OpenAI.Responses.ResponseInput = historyMessages.map((item) => ({
    role: item.role,
    content: item.content,
  }));

  return {
    success: true,
    prepared: {
      activeThreadId,
      instructions,
      input,
      tools,
      agentKey,
      melusiThreadType,
      usageMetadata,
    },
  };
}
