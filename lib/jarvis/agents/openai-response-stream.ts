import "server-only";

import type OpenAI from "openai";
import type { ResponseStreamEvent } from "openai/resources/responses/responses";
import { accumulateResponse } from "openai/lib/responses/ResponseAccumulator";

import { extractResponseText } from "@/lib/jarvis/agents/agent-diagnostics";

export type ConsumeOpenAiResponseStreamCallbacks = {
  onSafeTextDelta?: (delta: string) => void;
  onResetVisibleText?: () => void;
  onFunctionCallDetected?: () => void;
  onFirstSafeTextDelta?: () => void;
};

export type ConsumeOpenAiResponseStreamResult = {
  response: OpenAI.Responses.Response;
  streamedText: string;
  discardedText: string;
  hadFunctionCalls: boolean;
  authoritativeText: string;
};

function responseHasFunctionCalls(response: OpenAI.Responses.Response): boolean {
  return response.output.some((item) => item.type === "function_call");
}

export async function consumeOpenAiResponseStream(
  stream: AsyncIterable<ResponseStreamEvent>,
  callbacks: ConsumeOpenAiResponseStreamCallbacks = {},
): Promise<ConsumeOpenAiResponseStreamResult> {
  let snapshot: OpenAI.Responses.Response | undefined;
  let roundHasFunctionCall = false;
  let streamedText = "";
  let discardedText = "";
  let firstSafeTextDeltaRecorded = false;

  for await (const event of stream) {
    snapshot = accumulateResponse(event, snapshot);

    if (
      event.type === "response.output_item.added" &&
      event.item.type === "function_call"
    ) {
      if (!roundHasFunctionCall) {
        roundHasFunctionCall = true;
        callbacks.onFunctionCallDetected?.();
        callbacks.onResetVisibleText?.();
        streamedText = "";
      }
    }

    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      if (roundHasFunctionCall) {
        discardedText += event.delta;
        continue;
      }

      streamedText += event.delta;
      callbacks.onSafeTextDelta?.(event.delta);

      if (!firstSafeTextDeltaRecorded) {
        firstSafeTextDeltaRecorded = true;
        callbacks.onFirstSafeTextDelta?.();
      }
    }
  }

  if (!snapshot) {
    throw new Error("OpenAI stream ended without a response snapshot.");
  }

  const hadFunctionCalls = roundHasFunctionCall || responseHasFunctionCalls(snapshot);
  const authoritativeText = extractResponseText(snapshot);

  if (hadFunctionCalls) {
    streamedText = "";
  }

  return {
    response: snapshot,
    streamedText,
    discardedText,
    hadFunctionCalls,
    authoritativeText,
  };
}

export function extractFunctionCalls(
  response: OpenAI.Responses.Response,
): OpenAI.Responses.ResponseFunctionToolCall[] {
  return response.output.filter(
    (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
      item.type === "function_call",
  );
}
