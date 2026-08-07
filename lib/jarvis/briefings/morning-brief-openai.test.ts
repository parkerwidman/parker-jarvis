import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";

import {
  INCOMPLETE_RESPONSE_CATEGORIES,
  MORNING_BRIEF_OPENAI_MAX_OUTPUT_TOKENS,
  MORNING_BRIEF_OPENAI_MODEL,
  MORNING_BRIEF_OPENAI_REASONING_EFFORT,
  buildMorningBriefOpenAiRequestParams,
  buildMorningBriefOpenAiResponseDiagnostic,
  classifyIncompleteResponseCategory,
  evaluateMorningBriefOpenAiResponse,
  isIncompleteMorningBriefResponse,
} from "@/lib/jarvis/briefings/morning-brief-openai";
import {
  logMorningBriefIncompleteResponse,
  MORNING_BRIEF_STAGES,
} from "@/lib/jarvis/briefings/morning-brief-diagnostics";

const SAMPLE_PROMPT =
  "Morning brief for Parker: finish proposal, investor sync at 2pm.";
const SAMPLE_RESPONSE_TEXT =
  "Good morning Parker. Your top priority is finishing the proposal before the investor sync.";

function buildResponse(
  overrides: Partial<OpenAI.Responses.Response> = {},
): OpenAI.Responses.Response {
  return {
    id: "resp_test",
    object: "response",
    created_at: 0,
    model: MORNING_BRIEF_OPENAI_MODEL,
    output: [],
    parallel_tool_calls: true,
    tool_choice: "auto",
    tools: [],
    ...overrides,
  } as OpenAI.Responses.Response;
}

describe("morning brief OpenAI request", () => {
  it("uses minimal reasoning and a 1200-token output budget", () => {
    const params = buildMorningBriefOpenAiRequestParams(
      "Speak concisely in 55 to 85 words.",
      SAMPLE_PROMPT,
    );

    expect(params.model).toBe("gpt-5");
    expect(params.store).toBe(false);
    expect(params.reasoning).toEqual({ effort: "minimal" });
    expect(params.max_output_tokens).toBe(1200);
    expect(MORNING_BRIEF_OPENAI_REASONING_EFFORT).toBe("minimal");
    expect(MORNING_BRIEF_OPENAI_MAX_OUTPUT_TOKENS).toBe(1200);
    expect(JSON.stringify(params)).toContain("55 to 85 words");
    expect(params.input).toEqual([{ role: "user", content: SAMPLE_PROMPT }]);
  });
});

describe("morning brief OpenAI response evaluation", () => {
  it("detects incomplete max-token responses separately from empty completed responses", () => {
    const incomplete = buildResponse({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output_text: "",
      usage: {
        input_tokens: 100,
        output_tokens: 400,
        total_tokens: 500,
        output_tokens_details: { reasoning_tokens: 400 },
      },
    });

    expect(isIncompleteMorningBriefResponse(incomplete)).toBe(true);
    expect(classifyIncompleteResponseCategory("max_output_tokens")).toBe(
      INCOMPLETE_RESPONSE_CATEGORIES.maxOutputTokensExhausted,
    );
    expect(evaluateMorningBriefOpenAiResponse(incomplete)).toEqual({
      kind: "incomplete",
      diagnostic: {
        responseStatus: "incomplete",
        incompleteReason: "max_output_tokens",
        incompleteCategory: INCOMPLETE_RESPONSE_CATEGORIES.maxOutputTokensExhausted,
        outputTokens: 400,
        reasoningTokens: 400,
        extractedLength: 0,
      },
    });

    const emptyCompleted = buildResponse({
      status: "completed",
      output_text: "",
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        total_tokens: 120,
        output_tokens_details: { reasoning_tokens: 20 },
      },
    });

    expect(evaluateMorningBriefOpenAiResponse(emptyCompleted)).toEqual({
      kind: "empty",
      diagnostic: {
        responseStatus: "completed",
        incompleteReason: null,
        outputTokens: 20,
        reasoningTokens: 20,
        extractedLength: 0,
      },
    });
  });

  it("treats incomplete partial text as incomplete rather than storable output", () => {
    const evaluation = evaluateMorningBriefOpenAiResponse(
      buildResponse({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output_text: "Good morning Parker, here is a partial",
        usage: {
          input_tokens: 100,
          output_tokens: 400,
          total_tokens: 500,
          output_tokens_details: { reasoning_tokens: 360 },
        },
      }),
    );

    expect(evaluation.kind).toBe("incomplete");
    if (evaluation.kind === "incomplete") {
      expect(evaluation.diagnostic.extractedLength).toBeGreaterThan(0);
      expect(evaluation.diagnostic.incompleteCategory).toBe(
        INCOMPLETE_RESPONSE_CATEGORIES.maxOutputTokensExhausted,
      );
    }
  });

  it("accepts completed concise text for downstream storage", () => {
    const evaluation = evaluateMorningBriefOpenAiResponse(
      buildResponse({
        status: "completed",
        output_text: SAMPLE_RESPONSE_TEXT,
        usage: {
          input_tokens: 100,
          output_tokens: 80,
          total_tokens: 180,
          output_tokens_details: { reasoning_tokens: 10 },
        },
      }),
    );

    expect(evaluation).toEqual({
      kind: "ok",
      extractedText: SAMPLE_RESPONSE_TEXT,
      diagnostic: {
        responseStatus: "completed",
        incompleteReason: null,
        outputTokens: 80,
        reasoningTokens: 10,
        extractedLength: SAMPLE_RESPONSE_TEXT.length,
      },
    });
  });

  it("logs incomplete diagnostics with token counts and reason only", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const diagnostic = buildMorningBriefOpenAiResponseDiagnostic(
      buildResponse({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output_text: SAMPLE_RESPONSE_TEXT,
        usage: {
          input_tokens: 100,
          output_tokens: 400,
          total_tokens: 500,
          output_tokens_details: { reasoning_tokens: 390 },
        },
      }),
      SAMPLE_RESPONSE_TEXT.length,
    );

    logMorningBriefIncompleteResponse({
      durationMs: 88,
      ...diagnostic,
    });

    const payload = errorSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({
      event: "morning_brief_stage",
      stage: MORNING_BRIEF_STAGES.openaiRequest,
      success: false,
      responseStatus: "incomplete",
      incompleteReason: "max_output_tokens",
      incompleteCategory: INCOMPLETE_RESPONSE_CATEGORIES.maxOutputTokensExhausted,
      outputTokens: 400,
      reasoningTokens: 390,
      extractedLength: SAMPLE_RESPONSE_TEXT.length,
      durationMs: 88,
    });

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(SAMPLE_PROMPT);
    expect(serialized).not.toContain(SAMPLE_RESPONSE_TEXT);

    errorSpy.mockRestore();
  });
});
