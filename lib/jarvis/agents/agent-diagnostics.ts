import type OpenAI from "openai";

import {
  buildPersonalFinanceToolDiagnosticPayload,
  isPersonalFinanceToolName,
} from "@/lib/jarvis/finance/personal-finance/personal-finance-diagnostics";

const SENSITIVE_LOG_PATTERNS: RegExp[] = [
  /OPENAI_API_KEY[=:\s]*\S+/gi,
  /SUPABASE[_A-Z]*[=:\s]*\S+/gi,
  /Cookie:\s*[^\n\r]*/gi,
  /Set-Cookie:\s*[^\n\r]*/gi,
  /authorization[=:\s]*\S+/gi,
  /Bearer\s+\S+/gi,
  /sk-[a-zA-Z0-9_-]{8,}/g,
  /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
  /process\.env\.[A-Z0-9_]+/gi,
];

export function sanitizeLogValue(value: string): string {
  let sanitized = value;
  for (const pattern of SENSITIVE_LOG_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized;
}

export const EMPTY_FINAL_REPLY =
  "I accessed the requested information, but I could not generate a readable summary. Please try the request again.";

export function logToolCallDiagnostic(
  round: number,
  toolName: string,
  output: string,
): void {
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;

    if (toolName === "propose_outlook_calendar_event" || toolName === "propose_task") {
      const payload: Record<string, unknown> = {
        round,
        toolName,
      };

      if (typeof parsed.success === "boolean") {
        payload.success = parsed.success;
      }
      if (typeof parsed.status === "string") {
        payload.actionRequestStatus = parsed.status;
      }
      if (typeof parsed.approvalRequired === "boolean") {
        payload.approvalRequired = parsed.approvalRequired;
      }

      console.log("[Jarvis tool diagnostic]", payload);
      return;
    }

    if (toolName === "get_melusi_expenses") {
      const payload: Record<string, unknown> = {
        round,
        toolName,
      };

      if (typeof parsed.success === "boolean") {
        payload.success = parsed.success;
      }
      if (typeof parsed.focus === "string") {
        payload.focus = parsed.focus;
      }
      if (typeof parsed.historyResultCount === "number") {
        payload.historyResultCount = parsed.historyResultCount;
      }
      if (typeof parsed.upcomingResultCount === "number") {
        payload.upcomingResultCount = parsed.upcomingResultCount;
      }
      if (typeof parsed.importSummaryCount === "number") {
        payload.importSummaryCount = parsed.importSummaryCount;
      }

      console.log("[Jarvis tool diagnostic]", payload);
      return;
    }

    if (isPersonalFinanceToolName(toolName)) {
      const diagnostic = buildPersonalFinanceToolDiagnosticPayload(toolName, output);
      if (diagnostic) {
        console.log("[Jarvis tool diagnostic]", { round, ...diagnostic });
        return;
      }
    }
  } catch {
    // Ignore unparsable tool output.
  }

  const payload: Record<string, unknown> = {
    round,
    toolName,
  };

  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;

    if (typeof parsed.success === "boolean") {
      payload.success = parsed.success;
    }
    if (typeof parsed.needsConnection === "boolean") {
      payload.needsConnection = parsed.needsConnection;
    }
    if (typeof parsed.needsReconnect === "boolean") {
      payload.needsReconnect = parsed.needsReconnect;
    }
    if (Array.isArray(parsed.messages)) {
      payload.messagesCount = parsed.messages.length;
    }
    if (Array.isArray(parsed.events)) {
      payload.eventsCount = parsed.events.length;
    }
    if (typeof parsed.savedToDrafts === "boolean") {
      payload.savedToDrafts = parsed.savedToDrafts;
    }
    if (Array.isArray(parsed.toRecipients)) {
      payload.toRecipientsCount = parsed.toRecipients.length;
    }
    if (Array.isArray(parsed.ccRecipients)) {
      payload.ccRecipientsCount = parsed.ccRecipients.length;
    }
    if (typeof parsed.status === "string") {
      payload.actionRequestStatus = parsed.status;
    }
  } catch {
    // Ignore unparsable tool output.
  }

  console.log("[Jarvis tool diagnostic]", payload);
}

export function logOpenAiResponseDiagnostic(
  round: number,
  response: OpenAI.Responses.Response,
): void {
  const outputItemTypes = response.output.map((item) => item.type);
  const functionCallCount = response.output.filter(
    (item) => item.type === "function_call",
  ).length;
  const outputTextLength =
    typeof response.output_text === "string" ? response.output_text.length : 0;

  console.log("[Jarvis tool diagnostic]", {
    round,
    outputItemTypes,
    functionCallCount,
    outputTextLength,
    responseStatus: response.status,
    incompleteReason: response.incomplete_details?.reason ?? null,
    totalOutputTokens: response.usage?.output_tokens ?? null,
    reasoningTokens:
      response.usage?.output_tokens_details?.reasoning_tokens ?? null,
  });
}

export function extractResponseText(response: OpenAI.Responses.Response): string {
  if (
    typeof response.output_text === "string" &&
    response.output_text.length > 0
  ) {
    return response.output_text.trim();
  }

  const textParts: string[] = [];

  for (const item of response.output) {
    if (item.type !== "message" || !("content" in item)) {
      continue;
    }

    const content = item.content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      if (
        contentItem.type === "output_text" &&
        "text" in contentItem &&
        typeof contentItem.text === "string"
      ) {
        textParts.push(contentItem.text);
      }
    }
  }

  return textParts.join("").trim();
}

export function logAssistantError(stage: string, error: unknown): void {
  const payload: Record<string, unknown> = { stage };

  if (error instanceof Error) {
    payload.name = error.name;
    payload.message = sanitizeLogValue(error.message);
    if (error.stack) {
      payload.stack = sanitizeLogValue(error.stack);
    }

    const extra = error as Error & Record<string, unknown>;
    if (typeof extra.status === "number" || typeof extra.status === "string") {
      payload.status = extra.status;
    }
    if (typeof extra.code === "string" || typeof extra.code === "number") {
      payload.code = extra.code;
    }
    if (typeof extra.type === "string") {
      payload.type = extra.type;
    }
    if (typeof extra.request_id === "string") {
      payload.request_id = extra.request_id;
    }
  } else if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;

    if (typeof record.name === "string") {
      payload.name = record.name;
    }
    if (typeof record.message === "string") {
      payload.message = sanitizeLogValue(record.message);
    }
    if (typeof record.status === "number" || typeof record.status === "string") {
      payload.status = record.status;
    }
    if (typeof record.code === "string" || typeof record.code === "number") {
      payload.code = record.code;
    }
    if (typeof record.type === "string") {
      payload.type = record.type;
    }
    if (typeof record.request_id === "string") {
      payload.request_id = record.request_id;
    }
    if (typeof record.stack === "string") {
      payload.stack = sanitizeLogValue(record.stack);
    }
  } else if (typeof error === "string") {
    payload.message = sanitizeLogValue(error);
  }

  console.error("[Jarvis assistant diagnostic]", payload);
}
