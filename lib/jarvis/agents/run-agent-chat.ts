import "server-only";

import OpenAI from "openai";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildSelectedRecordSection,
  loadAssistantContext,
} from "@/lib/jarvis/context/load-assistant-context";
import type { JarvisContextTarget } from "@/lib/jarvis/context/types";
import { loadJarvisContext } from "@/lib/jarvis/tools/memory-tools";
import {
  buildConversationInput,
  loadRecentThreadMessages,
  MAX_MESSAGE_LENGTH,
  persistAgentMessage,
} from "./agent-message-tools";
import {
  getAgentConfig,
  parseAgentKeyFromBody,
  parseThreadIdFromBody,
} from "./agent-registry";
import {
  EMPTY_FINAL_REPLY,
  extractResponseText,
  logAssistantError,
  logOpenAiResponseDiagnostic,
  logToolCallDiagnostic,
} from "./agent-diagnostics";
import { buildAgentInstructions } from "./instruction-builder";
import { buildPendingScheduleActionSection } from "@/lib/jarvis/schedule/build-pending-schedule-section";
import { loadActiveMainPendingScheduleAction } from "@/lib/jarvis/schedule/pending-schedule-actions";
import { detectScheduleConfirmationIntent } from "@/lib/jarvis/schedule/schedule-confirmation-intent";
import {
  resolveMelusiThreadForMessage,
  validateThreadAgentConsistency,
} from "./agent-thread-tools";
import { resolveMainThreadForMessage } from "@/lib/jarvis/conversations/main-conversation-tools";
import { getToolsForAgent } from "./tool-definitions";
import { executeJarvisTool } from "./tool-executor";
import {
  createInteractiveMainJarvisContext,
  createMelusiInteractiveContext,
} from "./tool-execution-context";
import type { AgentKey, MelusiThreadType } from "./types";

const MAX_TOOL_ROUNDS = 5;

export type RunAgentChatParams = {
  supabase: SupabaseClient;
  userId: string;
  message: string;
  agentKey: AgentKey;
  threadId: string | null;
  contextTarget: JarvisContextTarget | null;
};

export type RunAgentChatResult =
  | { success: true; reply: string; threadId?: string }
  | { success: false; error: string; status: number };

export async function runAgentChat(
  params: RunAgentChatParams,
): Promise<RunAgentChatResult> {
  const { supabase, userId, message, agentKey, threadId, contextTarget } =
    params;

  const agentConfig = getAgentConfig(agentKey);
  const tools = getToolsForAgent(agentKey);

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
  }

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

  const instructions = buildAgentInstructions(
    agentKey,
    jarvisContext,
    selectedRecordSection,
    melusiThreadType,
    agentKey === "main"
      ? buildPendingScheduleActionSection({
          pendingAction: await loadActiveMainPendingScheduleAction(
            supabase,
            userId,
          ),
          confirmationIntent: detectScheduleConfirmationIntent(message),
        })
      : "",
  );

  let historyMessages: Array<{ role: "user" | "assistant"; content: string }> =
    [];

  if (activeThreadId) {
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
  } else {
    historyMessages = [{ role: "user", content: message.trim() }];
  }

  const input: OpenAI.Responses.ResponseInput = historyMessages.map((item) => ({
    role: item.role,
    content: item.content,
  }));

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  let response: OpenAI.Responses.Response;
  let toolRound = 1;

  try {
    response = await openai.responses.create({
      model: "gpt-5",
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 8000,
      instructions,
      tools,
      input,
    });
  } catch (error) {
    logAssistantError("initial OpenAI request", error);
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      status: 500,
    };
  }

  logOpenAiResponseDiagnostic(toolRound, response);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const functionCalls = response.output.filter(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
        item.type === "function_call",
    );

    if (functionCalls.length === 0) {
      break;
    }

    input.push(...toResponseInputItems(response.output));

    for (const call of functionCalls) {
      const executionContext =
        agentKey === "main"
          ? createInteractiveMainJarvisContext(call.call_id, activeThreadId)
          : createMelusiInteractiveContext(call.call_id, activeThreadId);

      const toolOutput = await executeJarvisTool(
        supabase,
        userId,
        call,
        contextTarget,
        executionContext,
      );
      logToolCallDiagnostic(toolRound, call.name, toolOutput);
      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: toolOutput,
      });
    }

    toolRound += 1;

    try {
      response = await openai.responses.create({
        model: "gpt-5",
        store: false,
        reasoning: { effort: "low" },
        max_output_tokens: 8000,
        instructions,
        tools,
        input,
      });
    } catch (error) {
      logAssistantError("follow-up OpenAI request", error);
      return {
        success: false,
        error: "Something went wrong. Please try again.",
        status: 500,
      };
    }

    logOpenAiResponseDiagnostic(toolRound, response);
  }

  const replyText = extractResponseText(response);

  const finalReply =
    replyText.length > 0 ? replyText : EMPTY_FINAL_REPLY;

  if (activeThreadId) {
    const assistantPersist = await persistAgentMessage(
      supabase,
      userId,
      activeThreadId,
      agentKey,
      "assistant",
      finalReply,
    );

    if (!assistantPersist.success) {
      return { success: false, error: assistantPersist.error, status: 500 };
    }

    return {
      success: true,
      reply: finalReply,
      threadId: activeThreadId,
    };
  }

  return { success: true, reply: finalReply };
}

export { MAX_MESSAGE_LENGTH };
