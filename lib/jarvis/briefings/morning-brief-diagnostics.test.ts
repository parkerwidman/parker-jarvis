import { describe, expect, it, vi } from "vitest";
import {
  APIConnectionError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  RateLimitError,
} from "openai";

import {
  EMPTY_OUTPUT_REASONS,
  MORNING_BRIEF_STAGES,
  OPENAI_FAILURE_CATEGORIES,
  buildSupabaseErrorDiagnostic,
  classifyOpenAiFailure,
  logMorningBriefDiagnostic,
  logMorningBriefEmptyOutput,
  logMorningBriefOpenAiFailure,
  logMorningBriefSupabaseUpdateFailure,
} from "@/lib/jarvis/briefings/morning-brief-diagnostics";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SAMPLE_PROMPT =
  "Morning brief for Parker: finish proposal, investor sync at 2pm.";
const SAMPLE_SECRET = "sk-test-secret-key-value-1234567890";

function readLoggedPayload(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const call = spy.mock.calls.at(-1);
  expect(call).toBeDefined();
  return call?.[1] as Record<string, unknown>;
}

describe("morning brief diagnostics", () => {
  it("classifies OpenAI authentication failures", () => {
    const error = new AuthenticationError(401, undefined, "Invalid API key", undefined);

    expect(classifyOpenAiFailure(error)).toBe(
      OPENAI_FAILURE_CATEGORIES.authenticationConfiguration,
    );
  });

  it("classifies OpenAI rate limit failures", () => {
    const error = new RateLimitError(429, undefined, "Rate limit exceeded", undefined);

    expect(classifyOpenAiFailure(error)).toBe(OPENAI_FAILURE_CATEGORIES.rateLimit);
  });

  it("classifies unsupported model or option failures", () => {
    const error = new BadRequestError(
      400,
      { message: "The model `gpt-5` does not exist" },
      "Unsupported model",
      undefined,
    );

    expect(classifyOpenAiFailure(error)).toBe(
      OPENAI_FAILURE_CATEGORIES.unsupportedModelOrOptions,
    );
  });

  it("classifies provider outage failures", () => {
    const error = new InternalServerError(503, undefined, "Service unavailable", undefined);

    expect(classifyOpenAiFailure(error)).toBe(OPENAI_FAILURE_CATEGORIES.providerOutage);
  });

  it("classifies network failures", () => {
    const error = new APIConnectionError({ message: "Connection error" });

    expect(classifyOpenAiFailure(error)).toBe(OPENAI_FAILURE_CATEGORIES.networkFailure);
  });

  it("logs OpenAI failures with safe stage diagnostics", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new RateLimitError(429, undefined, "Rate limit exceeded", undefined);

    logMorningBriefOpenAiFailure(error, { durationMs: 42 });

    const payload = readLoggedPayload(errorSpy);
    expect(payload).toMatchObject({
      event: "morning_brief_stage",
      stage: MORNING_BRIEF_STAGES.openaiRequest,
      success: false,
      failureCategory: OPENAI_FAILURE_CATEGORIES.rateLimit,
      providerStatus: 429,
      durationMs: 42,
    });
    expect(payload.errorName).toBeTruthy();
    expect(JSON.stringify(payload)).not.toContain(SAMPLE_PROMPT);
    expect(JSON.stringify(payload)).not.toContain(SAMPLE_SECRET);
    expect(JSON.stringify(payload)).not.toContain(USER_ID);

    errorSpy.mockRestore();
  });

  it("distinguishes empty extracted output from normalization removing all output", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logMorningBriefEmptyOutput(EMPTY_OUTPUT_REASONS.emptyExtractedText, {
      extractedLength: 0,
      responseStatus: "completed",
    });
    const emptyExtractedPayload = readLoggedPayload(errorSpy);
    expect(emptyExtractedPayload).toMatchObject({
      stage: MORNING_BRIEF_STAGES.responseExtraction,
      emptyOutputReason: EMPTY_OUTPUT_REASONS.emptyExtractedText,
      extractedLength: 0,
    });

    logMorningBriefEmptyOutput(EMPTY_OUTPUT_REASONS.normalizationRemovedAll, {
      extractedLength: 12,
      normalizedLength: 0,
    });
    const normalizationPayload = readLoggedPayload(errorSpy);
    expect(normalizationPayload).toMatchObject({
      stage: MORNING_BRIEF_STAGES.spokenTextNormalization,
      emptyOutputReason: EMPTY_OUTPUT_REASONS.normalizationRemovedAll,
      extractedLength: 12,
      normalizedLength: 0,
    });

    errorSpy.mockRestore();
  });

  it("logs final database update failures with safe Supabase fields only", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logMorningBriefSupabaseUpdateFailure(
      {
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: `Key (user_id)=(${USER_ID}) already exists.`,
        hint: null,
      },
      { durationMs: 17 },
    );

    const payload = readLoggedPayload(errorSpy);
    expect(payload).toMatchObject({
      event: "morning_brief_stage",
      stage: MORNING_BRIEF_STAGES.briefingUpdate,
      success: false,
      supabaseCode: "23505",
      durationMs: 17,
    });
    expect(payload.supabaseMessage).toBe(
      "duplicate key value violates unique constraint",
    );
    expect(JSON.stringify(payload)).not.toContain(USER_ID);
    expect(JSON.stringify(payload)).not.toContain("details");
    expect(JSON.stringify(payload)).not.toContain(SAMPLE_PROMPT);

    errorSpy.mockRestore();
  });

  it("redacts secrets from diagnostic error messages", () => {
    const sanitized = buildSupabaseErrorDiagnostic({
      code: "22000",
      message: `Authorization Bearer ${SAMPLE_SECRET}`,
    }).supabaseMessage;

    expect(sanitized).toBeDefined();
    expect(sanitized).not.toContain(SAMPLE_SECRET);
    expect(sanitized).not.toContain("sk-test");
  });

  it("does not include prompts or private content in generic stage diagnostics", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logMorningBriefDiagnostic({
      stage: MORNING_BRIEF_STAGES.briefPlanning,
      success: true,
      durationMs: 10,
    });

    const payload = readLoggedPayload(infoSpy);
    expect(payload).toEqual({
      event: "morning_brief_stage",
      stage: MORNING_BRIEF_STAGES.briefPlanning,
      success: true,
      durationMs: 10,
    });
    expect(JSON.stringify(payload)).not.toContain(SAMPLE_PROMPT);
    expect(JSON.stringify(payload)).not.toContain(USER_ID);

    infoSpy.mockRestore();
  });
});
