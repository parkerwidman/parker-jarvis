import "server-only";

import OpenAI from "openai";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JarvisContextTarget } from "@/lib/jarvis/context/types";
import { prepareAgentChatTurn } from "@/lib/jarvis/agents/agent-chat-setup";
import {
  buildEmptyFinalFallback,
  createWriteAttemptSummary,
  reconcileFinalRoundText,
  recordWriteAttempt,
  type WriteAttemptSummary,
} from "@/lib/jarvis/agents/final-response-resolution";
import {
  logAssistantError,
  logOpenAiResponseDiagnostic,
  logToolCallDiagnostic,
} from "@/lib/jarvis/agents/agent-diagnostics";
import {
  consumeOpenAiResponseStream,
  extractFunctionCalls,
} from "@/lib/jarvis/agents/openai-response-stream";
import { executeToolSegmentsInOrder, classifyToolExecutionSafety } from "@/lib/jarvis/agents/tool-execution-safety";
import { executeJarvisTool } from "@/lib/jarvis/agents/tool-executor";
import {
  createInteractiveMainJarvisContext,
} from "@/lib/jarvis/agents/tool-execution-context";
import { persistAgentMessage } from "@/lib/jarvis/agents/agent-message-tools";
import { scheduleConversationSummaryUpdate } from "@/lib/jarvis/context-engine/schedule-summary-update";
import {
  evaluateReadFastPath,
  executeReadFastPath,
  type ReadFastPathReason,
} from "@/lib/jarvis/agents/read-fast-path";
import {
  JarvisRequestUsageCollector,
  buildFastPathUsageMetadata,
  estimateToolResultTokens,
  parseToolResultSuccess,
} from "@/lib/jarvis/performance/model-usage";
import { estimateTokens } from "@/lib/jarvis/context-engine/context-budget";
import { createJarvisStreamEncoder } from "@/lib/jarvis/streaming/stream-encoder";
import type { JarvisStreamEvent } from "@/lib/jarvis/streaming/stream-events";
import { JARVIS_STREAM_CONTENT_TYPE } from "@/lib/jarvis/streaming/stream-events";
import {
  RequestPerformanceCollector,
  extractUsageFields,
} from "@/lib/jarvis/performance/request-performance";

const MAX_TOOL_ROUNDS = 5;

export type RunAgentChatStreamParams = {
  supabase: SupabaseClient;
  userId: string;
  message: string;
  threadId: string | null;
  contextTarget: JarvisContextTarget | null;
  requestId: string;
  requestReceivedAt?: number;
  authCompleteAt?: number;
};

export function createMainAgentChatStreamResponse(
  params: RunAgentChatStreamParams,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void runMainAgentChatStream(params, controller).catch((error) => {
        logAssistantError("stream runner", error);

        try {
          const emit = createJarvisStreamEncoder(controller);
          emit({
            type: "error",
            code: "stream_failed",
            message: "Something went wrong. Please try again.",
            requestId: params.requestId,
          });
        } catch {
          // Ignore secondary encoder failures.
        }

        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": JARVIS_STREAM_CONTENT_TYPE,
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function runMainAgentChatStream(
  params: RunAgentChatStreamParams,
  controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<void> {
  const performance = new RequestPerformanceCollector(
    params.requestId,
    "main",
    params.requestReceivedAt,
  );
  if (params.authCompleteAt !== undefined) {
    performance.mark("auth_complete", params.authCompleteAt);
  }
  const usage = new JarvisRequestUsageCollector(params.requestId, "main");
  const emit = createJarvisStreamEncoder(controller);

  const preparedResult = await prepareAgentChatTurn({
    supabase: params.supabase,
    userId: params.userId,
    message: params.message,
    agentKey: "main",
    threadId: params.threadId,
    contextTarget: params.contextTarget,
    performance,
  });

  if (!preparedResult.success) {
    performance.failureCode = "prepare_failed";
    emit({
      type: "error",
      code: "prepare_failed",
      message: preparedResult.error,
      requestId: params.requestId,
    });
    performance.mark("stream_complete");
    performance.logIfEnabled();
    usage.logIfEnabled();
    controller.close();
    return;
  }

  const { prepared } = preparedResult;
  usage.setMetadata(prepared.usageMetadata);

  emit({
    type: "thread",
    threadId: prepared.activeThreadId,
  });

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const input = [...prepared.input];
  let finalReply = "";
  const writeAttempts = createWriteAttemptSummary();
  let pendingToolResultTokens: number | undefined;
  let awaitingFinalSynthesis = false;
  let instructions = prepared.instructions;
  let exposedTools = prepared.tools;

  const fastPathEligibility =
    prepared.mainTurnContext &&
    evaluateReadFastPath({
      message: params.message,
      confirmationIntent: prepared.mainTurnContext.confirmationIntent,
      pendingAction: prepared.mainTurnContext.pendingAction,
      contextTarget: params.contextTarget,
      timeZone: prepared.mainTurnContext.timeZone,
    });

  let useReadFastPath = Boolean(fastPathEligibility?.eligible);

  if (
    useReadFastPath &&
    fastPathEligibility?.eligible &&
    prepared.mainTurnContext
  ) {
    performance.beginToolBatch(0);

    const prefetch = await executeReadFastPath({
      supabase: params.supabase,
      userId: params.userId,
      message: params.message,
      confirmationIntent: prepared.mainTurnContext.confirmationIntent,
      pendingAction: prepared.mainTurnContext.pendingAction,
      contextTarget: params.contextTarget,
      timeZone: prepared.mainTurnContext.timeZone,
      threadId: prepared.activeThreadId,
      eligibility: {
        eligible: true,
        reason: fastPathEligibility.reason as ReadFastPathReason,
        reads: fastPathEligibility.reads,
      },
    });

    for (const result of prefetch.results) {
      usage.recordToolExecution({
        round: 0,
        toolName: result.toolName,
        safety: classifyToolExecutionSafety(result.toolName),
        resultTokensEstimated: estimateTokens(result.output),
        success: result.success,
        durationMs: result.durationMs,
      });
      logToolCallDiagnostic(0, result.toolName, result.output);
    }

    usage.toolRoundCount += 1;
    usage.toolCallCount += prefetch.prefetchedReads;
    performance.completeToolBatch();
    performance.toolRoundCount += 1;
    performance.toolCallCount += prefetch.prefetchedReads;

    if (!prefetch.prefetchDataSection) {
      useReadFastPath = false;
    } else {
      performance.setFastPathMetadata({
        enabled: true,
        reason: prefetch.reason,
        prefetchedReads: prefetch.prefetchedReads,
      });

      usage.setMetadata(
        buildFastPathUsageMetadata({
          prepared: prepared.usageMetadata,
          fastPathReason: prefetch.reason,
          prefetchedReads: prefetch.prefetchedReads,
        }),
      );

      instructions = `${prepared.instructions}${prefetch.prefetchDataSection}`;
      exposedTools = [];
      pendingToolResultTokens = estimateToolResultTokens(
        prefetch.results.map((result) => result.output),
      );
      awaitingFinalSynthesis = true;
    }
  }

  const emitReconciledFinalText = (text: string, reconciled: boolean) => {
    if (!reconciled) {
      return;
    }

    emit({ type: "reset" });
    if (text.length > 0) {
      emit({ type: "delta", delta: text });
      performance.recordModelRoundFirstTextDelta();
      performance.recordFinalRoundFirstSafeTextDelta();
    }
  };

  try {
    const maxRounds = useReadFastPath ? 1 : MAX_TOOL_ROUNDS;

    for (let round = 0; round < maxRounds; round += 1) {
      const roundNumber = useReadFastPath ? 1 : round + 1;
      performance.beginModelRound(roundNumber);

      let roundStreamedText = "";

      const stream = await openai.responses.create({
        model: "gpt-5",
        store: false,
        reasoning: { effort: "low" },
        max_output_tokens: 8000,
        instructions,
        tools: exposedTools,
        input,
        stream: true,
      });

      const consumed = await consumeOpenAiResponseStream(stream, {
        onSafeTextDelta: (delta) => {
          roundStreamedText += delta;
          finalReply += delta;
          emit({ type: "delta", delta });
          performance.recordModelRoundFirstTextDelta();
          if (awaitingFinalSynthesis) {
            performance.recordFinalRoundFirstSafeTextDelta();
          }
        },
        onResetVisibleText: () => {
          roundStreamedText = "";
          finalReply = "";
          emit({ type: "reset" });
        },
        onFunctionCallDetected: () => {
          emit({ type: "status", status: "working" });
        },
      });

      logOpenAiResponseDiagnostic(roundNumber, consumed.response);
      usage.recordModelRound(
        consumed.response,
        roundNumber,
        pendingToolResultTokens,
      );
      pendingToolResultTokens = undefined;

      const functionCalls = extractFunctionCalls(consumed.response);
      const usageFields = consumed.response.usage
        ? extractUsageFields(consumed.response.usage)
        : null;

      performance.completeModelRound({
        toolCallsRequested: functionCalls.length,
        finalTextRound: functionCalls.length === 0,
        inputTokens: usageFields?.inputTokens ?? null,
        cachedInputTokens: usageFields?.cachedInputTokens ?? null,
        outputTokens: usageFields?.outputTokens ?? null,
        reasoningTokens: usageFields?.reasoningTokens ?? null,
      });

      if (functionCalls.length === 0 || useReadFastPath) {
        const reconciliation = reconcileFinalRoundText({
          streamedText: roundStreamedText,
          response: consumed.response,
        });

        finalReply = reconciliation.finalText;
        emitReconciledFinalText(finalReply, reconciliation.reconciled);
        break;
      }

      finalReply = "";
      emit({ type: "reset" });
      input.push(...toResponseInputItems(consumed.response.output));

      usage.toolRoundCount += 1;
      usage.toolCallCount += functionCalls.length;
      performance.beginToolBatch(roundNumber);

      const executed = await executeToolSegmentsInOrder({
        calls: functionCalls,
        getToolName: (call) => call.name,
        executeCall: async (call) => {
          const executionContext = createInteractiveMainJarvisContext(
            call.call_id,
            prepared.activeThreadId,
          );

          const startedAt = Date.now();
          const toolOutput = await executeJarvisTool(
            params.supabase,
            params.userId,
            call,
            params.contextTarget,
            executionContext,
          );

          usage.recordToolExecution({
            round: round + 1,
            toolName: call.name,
            safety: classifyToolExecutionSafety(call.name),
            resultTokensEstimated: estimateTokens(toolOutput),
            success: parseToolResultSuccess(toolOutput),
            durationMs: Date.now() - startedAt,
          });

          recordWriteAttemptForTool(writeAttempts, call.name, toolOutput);
          logToolCallDiagnostic(round + 1, call.name, toolOutput);
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

      performance.completeToolBatch();
      performance.toolRoundCount += 1;
      performance.toolCallCount += functionCalls.length;
      awaitingFinalSynthesis = true;
    }

    const normalizedReply =
      finalReply.trim().length > 0
        ? finalReply.trim()
        : buildEmptyFinalFallback(writeAttempts);

    performance.mark("assistant_persist_start");
    const assistantPersist = await persistAgentMessage(
      params.supabase,
      params.userId,
      prepared.activeThreadId,
      "main",
      "assistant",
      normalizedReply,
    );

    if (!assistantPersist.success) {
      performance.failureCode = "assistant_persist_failed";
      emit({
        type: "error",
        code: "assistant_persist_failed",
        message:
          "Your response was generated but could not be saved. Please try again.",
        requestId: params.requestId,
      });
      performance.mark("stream_complete");
      performance.logIfEnabled();
      usage.logIfEnabled();
      controller.close();
      return;
    }

    performance.mark("assistant_persisted");
    scheduleConversationSummaryUpdate(
      params.supabase,
      params.userId,
      prepared.activeThreadId,
    );

    emit({
      type: "done",
      threadId: prepared.activeThreadId,
      reply: normalizedReply,
      requestId: params.requestId,
    });

    performance.success = true;
    performance.mark("stream_complete");
    performance.logIfEnabled();
    usage.logIfEnabled();
    controller.close();
  } catch (error) {
    logAssistantError("main streaming chat", error);
    performance.failureCode = "model_stream_failed";
    emit({
      type: "error",
      code: "model_stream_failed",
      message: "Something went wrong. Please try again.",
      requestId: params.requestId,
    });
    performance.mark("stream_complete");
    performance.logIfEnabled();
    usage.logIfEnabled();
    controller.close();
  }
}

export function parseStreamRequested(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "stream" in body &&
    (body as { stream: unknown }).stream === true
  );
}

export function createRequestId(): string {
  return crypto.randomUUID();
}

function recordWriteAttemptForTool(
  summary: WriteAttemptSummary,
  toolName: string,
  toolOutput: string,
): void {
  if (classifyToolExecutionSafety(toolName) !== "write") {
    return;
  }

  recordWriteAttempt(summary, toolName, toolOutput);
}

export type { JarvisStreamEvent };
