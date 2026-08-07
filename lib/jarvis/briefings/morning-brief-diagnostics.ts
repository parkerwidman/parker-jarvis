import "server-only";

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
} from "openai";

import { sanitizeLogValue } from "@/lib/jarvis/agents/agent-diagnostics";

export const MORNING_BRIEF_STAGES = {
  contextLoading: "context_loading",
  snapshotLoading: "snapshot_loading",
  outlookCalendarLoading: "outlook_calendar_loading",
  briefPlanning: "brief_planning",
  openaiRequest: "openai_request",
  responseExtraction: "response_extraction",
  spokenTextNormalization: "spoken_text_normalization",
  briefingUpdate: "briefing_update",
} as const;

export type MorningBriefStage =
  (typeof MORNING_BRIEF_STAGES)[keyof typeof MORNING_BRIEF_STAGES];

export const OPENAI_FAILURE_CATEGORIES = {
  authenticationConfiguration: "authentication_configuration",
  invalidRequestParameters: "invalid_request_parameters",
  unsupportedModelOrOptions: "unsupported_model_or_options",
  rateLimit: "rate_limit",
  providerOutage: "provider_outage",
  networkFailure: "network_failure",
  unknown: "unknown",
} as const;

export type OpenAiFailureCategory =
  (typeof OPENAI_FAILURE_CATEGORIES)[keyof typeof OPENAI_FAILURE_CATEGORIES];

export const EMPTY_OUTPUT_REASONS = {
  emptyExtractedText: "empty_extracted_text",
  normalizationRemovedAll: "normalization_removed_all",
} as const;

export type EmptyOutputReason =
  (typeof EMPTY_OUTPUT_REASONS)[keyof typeof EMPTY_OUTPUT_REASONS];

export type MorningBriefStageDiagnostic = {
  stage: MorningBriefStage;
  success: boolean;
  durationMs?: number;
  errorName?: string;
  errorMessage?: string;
  providerStatus?: number | string;
  providerCode?: string | number;
  providerType?: string;
  failureCategory?: OpenAiFailureCategory;
  emptyOutputReason?: EmptyOutputReason;
  incompleteReason?: string | null;
  incompleteCategory?: string;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  supabaseCode?: string;
  supabaseMessage?: string;
  extractedLength?: number;
  normalizedLength?: number;
  responseStatus?: string;
  eventCount?: number;
  calendarSuccess?: boolean;
  tasksSuccess?: boolean;
  melusiSnapshotSuccess?: boolean;
  financeSnapshotSuccess?: boolean;
};

function readErrorName(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.name;
  }

  if (typeof error === "object" && error !== null && typeof (error as { name?: unknown }).name === "string") {
    return (error as { name: string }).name;
  }

  return undefined;
}

function readSanitizedErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message) {
    return sanitizeLogValue(error.message);
  }

  if (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return sanitizeLogValue((error as { message: string }).message);
  }

  if (typeof error === "string") {
    return sanitizeLogValue(error);
  }

  return undefined;
}

function readProviderFields(error: unknown): {
  providerStatus?: number | string;
  providerCode?: string | number;
  providerType?: string;
} {
  if (!(error instanceof APIError)) {
    return {};
  }

  return {
    ...(typeof error.status === "number" || typeof error.status === "string"
      ? { providerStatus: error.status }
      : {}),
    ...(typeof error.code === "string" || typeof error.code === "number"
      ? { providerCode: error.code }
      : {}),
    ...(typeof error.type === "string" ? { providerType: error.type } : {}),
  };
}

function isUnsupportedModelOrOptionsError(error: BadRequestError): boolean {
  const haystack = [
    error.message,
    error.code ?? "",
    error.param ?? "",
    typeof error.error === "object" && error.error !== null
      ? JSON.stringify(error.error)
      : "",
  ]
    .join(" ")
    .toLowerCase();

  return (
    haystack.includes("model") ||
    haystack.includes("reasoning") ||
    haystack.includes("unsupported") ||
    haystack.includes("not supported") ||
    haystack.includes("max_output_tokens")
  );
}

export function classifyOpenAiFailure(error: unknown): OpenAiFailureCategory {
  if (
    error instanceof AuthenticationError ||
    error instanceof PermissionDeniedError
  ) {
    return OPENAI_FAILURE_CATEGORIES.authenticationConfiguration;
  }

  if (error instanceof RateLimitError) {
    return OPENAI_FAILURE_CATEGORIES.rateLimit;
  }

  if (error instanceof APIConnectionError || error instanceof APIConnectionTimeoutError) {
    return OPENAI_FAILURE_CATEGORIES.networkFailure;
  }

  if (error instanceof InternalServerError) {
    return OPENAI_FAILURE_CATEGORIES.providerOutage;
  }

  if (error instanceof BadRequestError) {
    return isUnsupportedModelOrOptionsError(error)
      ? OPENAI_FAILURE_CATEGORIES.unsupportedModelOrOptions
      : OPENAI_FAILURE_CATEGORIES.invalidRequestParameters;
  }

  if (error instanceof APIError) {
    const status = error.status;
    if (typeof status === "number" && status >= 500) {
      return OPENAI_FAILURE_CATEGORIES.providerOutage;
    }
    if (status === 401 || status === 403) {
      return OPENAI_FAILURE_CATEGORIES.authenticationConfiguration;
    }
    if (status === 429) {
      return OPENAI_FAILURE_CATEGORIES.rateLimit;
    }
    if (status === 400) {
      return OPENAI_FAILURE_CATEGORIES.invalidRequestParameters;
    }
  }

  return OPENAI_FAILURE_CATEGORIES.unknown;
}

export function buildSupabaseErrorDiagnostic(
  error: unknown,
): Pick<MorningBriefStageDiagnostic, "supabaseCode" | "supabaseMessage"> {
  if (typeof error !== "object" || error === null) {
    return {};
  }

  const record = error as Record<string, unknown>;

  return {
    ...(typeof record.code === "string" ? { supabaseCode: record.code } : {}),
    ...(typeof record.message === "string"
      ? { supabaseMessage: sanitizeLogValue(record.message) }
      : {}),
  };
}

export function logMorningBriefDiagnostic(
  diagnostic: MorningBriefStageDiagnostic,
): void {
  const payload: Record<string, unknown> = {
    event: "morning_brief_stage",
    stage: diagnostic.stage,
    success: diagnostic.success,
  };

  const optionalFields: Array<keyof MorningBriefStageDiagnostic> = [
    "durationMs",
    "errorName",
    "errorMessage",
    "providerStatus",
    "providerCode",
    "providerType",
    "failureCategory",
    "emptyOutputReason",
    "incompleteReason",
    "incompleteCategory",
    "outputTokens",
    "reasoningTokens",
    "supabaseCode",
    "supabaseMessage",
    "extractedLength",
    "normalizedLength",
    "responseStatus",
    "eventCount",
    "calendarSuccess",
    "tasksSuccess",
    "melusiSnapshotSuccess",
    "financeSnapshotSuccess",
  ];

  for (const field of optionalFields) {
    const value = diagnostic[field];
    if (value !== undefined) {
      payload[field] = value;
    }
  }

  if (diagnostic.success) {
    console.info("[morning-brief diagnostic]", payload);
  } else {
    console.error("[morning-brief diagnostic]", payload);
  }
}

export function logMorningBriefStageFailure(
  stage: MorningBriefStage,
  error: unknown,
  meta: Partial<MorningBriefStageDiagnostic> = {},
): void {
  logMorningBriefDiagnostic({
    stage,
    success: false,
    errorName: readErrorName(error),
    errorMessage: readSanitizedErrorMessage(error),
    ...readProviderFields(error),
    ...meta,
  });
}

export function logMorningBriefOpenAiFailure(
  error: unknown,
  meta: Partial<MorningBriefStageDiagnostic> = {},
): void {
  logMorningBriefDiagnostic({
    stage: MORNING_BRIEF_STAGES.openaiRequest,
    success: false,
    failureCategory: classifyOpenAiFailure(error),
    errorName: readErrorName(error),
    errorMessage: readSanitizedErrorMessage(error),
    ...readProviderFields(error),
    ...meta,
  });
}

export function logMorningBriefEmptyOutput(
  emptyOutputReason: EmptyOutputReason,
  meta: Partial<MorningBriefStageDiagnostic> = {},
): void {
  const stage =
    emptyOutputReason === EMPTY_OUTPUT_REASONS.emptyExtractedText
      ? MORNING_BRIEF_STAGES.responseExtraction
      : MORNING_BRIEF_STAGES.spokenTextNormalization;

  logMorningBriefDiagnostic({
    stage,
    success: false,
    emptyOutputReason,
    ...meta,
  });
}

export function logMorningBriefSupabaseUpdateFailure(
  error: unknown,
  meta: Partial<MorningBriefStageDiagnostic> = {},
): void {
  logMorningBriefDiagnostic({
    stage: MORNING_BRIEF_STAGES.briefingUpdate,
    success: false,
    ...buildSupabaseErrorDiagnostic(error),
    ...meta,
  });
}

export function logMorningBriefIncompleteResponse(
  meta: Partial<MorningBriefStageDiagnostic> = {},
): void {
  logMorningBriefDiagnostic({
    stage: MORNING_BRIEF_STAGES.openaiRequest,
    success: false,
    ...meta,
  });
}
