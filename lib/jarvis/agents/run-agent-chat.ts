import "server-only";

import OpenAI from "openai";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JarvisContextTarget } from "@/lib/jarvis/context/types";
import { prepareAgentChatTurn } from "@/lib/jarvis/agents/agent-chat-setup";
import {
  buildEmptyFinalFallback,
  createWriteAttemptSummary,
  recordWriteAttempt,
} from "@/lib/jarvis/agents/final-response-resolution";
import { classifyToolExecutionSafety } from "./tool-execution-safety";
import { extractResponseText, logAssistantError, logOpenAiResponseDiagnostic, logToolCallDiagnostic } from "./agent-diagnostics";
import { executeToolSegmentsInOrder } from "./tool-execution-safety";
import {
  MAX_MESSAGE_LENGTH,
  persistAgentMessage,
} from "./agent-message-tools";
import { executeJarvisTool } from "./tool-executor";
import {
  createInteractiveMainJarvisContext,
  createMelusiInteractiveContext,
} from "./tool-execution-context";
import { scheduleConversationSummaryUpdate } from "@/lib/jarvis/context-engine/schedule-summary-update";
import {
  JarvisRequestUsageCollector,
  estimateToolResultTokens,
  parseToolResultSuccess,
} from "@/lib/jarvis/performance/model-usage";
import { estimateTokens } from "@/lib/jarvis/context-engine/context-budget";
import type { AgentKey } from "./types";

const MAX_TOOL_ROUNDS = 5;

export type RunAgentChatParams = {
  supabase: SupabaseClient;
  userId: string;
  message: string;
  agentKey: AgentKey;
  threadId: string | null;
  contextTarget: JarvisContextTarget | null;
  requestId?: string;
};

export type RunAgentChatResult =
  | { success: true; reply: string; threadId?: string }
  | { success: false; error: string; status: number };

export async function runAgentChat(
  params: RunAgentChatParams,
): Promise<RunAgentChatResult> {
  const { supabase, userId, message, agentKey, threadId, contextTarget } =
    params;

  const preparedResult = await prepareAgentChatTurn({
    supabase,
    userId,
    message,
    agentKey,
    threadId,
    contextTarget,
  });

  if (!preparedResult.success) {
    return {
      success: false,
      error: preparedResult.error,
      status: preparedResult.status,
    };
  }

  const { prepared } = preparedResult;
  const usage = new JarvisRequestUsageCollector(
    params.requestId ?? crypto.randomUUID(),
    agentKey,
  );
  usage.setMetadata(prepared.usageMetadata);

  const input: OpenAI.Responses.ResponseInput = [...prepared.input];

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  let response: OpenAI.Responses.Response;
  let toolRound = 1;
  const writeAttempts = createWriteAttemptSummary();
  let pendingToolResultTokens: number | undefined;

  try {
    response = await openai.responses.create({
      model: "gpt-5",
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 8000,
      instructions: prepared.instructions,
      tools: prepared.tools,
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
  usage.recordModelRound(response, toolRound, pendingToolResultTokens);
  pendingToolResultTokens = undefined;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const functionCalls = response.output.filter(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
        item.type === "function_call",
    );

    if (functionCalls.length === 0) {
      break;
    }

    input.push(...toResponseInputItems(response.output));

    const executed = await executeToolSegmentsInOrder({
      calls: functionCalls,
      getToolName: (call) => call.name,
      executeCall: async (call) => {
        const executionContext =
          agentKey === "main"
            ? createInteractiveMainJarvisContext(
                call.call_id,
                prepared.activeThreadId,
              )
            : createMelusiInteractiveContext(call.call_id, prepared.activeThreadId);

        const startedAt = Date.now();
        const toolOutput = await executeJarvisTool(
          supabase,
          userId,
          call,
          contextTarget,
          executionContext,
        );

        usage.recordToolExecution({
          round: toolRound,
          toolName: call.name,
          safety: classifyToolExecutionSafety(call.name),
          resultTokensEstimated: estimateTokens(toolOutput),
          success: parseToolResultSuccess(toolOutput),
          durationMs: Date.now() - startedAt,
        });

        logToolCallDiagnostic(toolRound, call.name, toolOutput);
        if (classifyToolExecutionSafety(call.name) === "write") {
          recordWriteAttempt(writeAttempts, call.name, toolOutput);
        }
        return toolOutput;
      },
    });

    for (const { call, result } of executed) {
      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: result,
      });
    }

    pendingToolResultTokens = estimateToolResultTokens(
      executed.map(({ result }) => result),
    );
    usage.toolRoundCount += 1;
    usage.toolCallCount += functionCalls.length;

    toolRound += 1;

    try {
      response = await openai.responses.create({
        model: "gpt-5",
        store: false,
        reasoning: { effort: "low" },
        max_output_tokens: 8000,
        instructions: prepared.instructions,
        tools: prepared.tools,
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
    usage.recordModelRound(response, toolRound, pendingToolResultTokens);
    pendingToolResultTokens = undefined;
  }

  const replyText = extractResponseText(response);

  const finalReply =
    replyText.length > 0
      ? replyText
      : buildEmptyFinalFallback(writeAttempts);

  usage.logIfEnabled();

  const assistantPersist = await persistAgentMessage(
    supabase,
    userId,
    prepared.activeThreadId,
    agentKey,
    "assistant",
    finalReply,
  );

  if (!assistantPersist.success) {
    return { success: false, error: assistantPersist.error, status: 500 };
  }

  if (agentKey === "main") {
    scheduleConversationSummaryUpdate(supabase, userId, prepared.activeThreadId);
  }

  return {
    success: true,
    reply: finalReply,
    threadId: prepared.activeThreadId,
  };
}

export { MAX_MESSAGE_LENGTH };
