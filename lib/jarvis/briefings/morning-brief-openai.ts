import type OpenAI from "openai";

import { extractResponseText } from "@/lib/jarvis/agents/agent-diagnostics";

export const MORNING_BRIEF_OPENAI_MODEL = "gpt-5";
export const MORNING_BRIEF_OPENAI_REASONING_EFFORT = "minimal" as const;
export const MORNING_BRIEF_OPENAI_MAX_OUTPUT_TOKENS = 1200;

export const INCOMPLETE_RESPONSE_CATEGORIES = {
  maxOutputTokensExhausted: "max_output_tokens_exhausted",
  incompleteOther: "incomplete_other",
} as const;

export type IncompleteResponseCategory =
  (typeof INCOMPLETE_RESPONSE_CATEGORIES)[keyof typeof INCOMPLETE_RESPONSE_CATEGORIES];

export type MorningBriefOpenAiResponseDiagnostic = {
  responseStatus: string;
  incompleteReason: string | null;
  incompleteCategory?: IncompleteResponseCategory;
  outputTokens: number | null;
  reasoningTokens: number | null;
  extractedLength: number;
};

export function buildMorningBriefOpenAiRequestParams(
  instructions: string,
  prompt: string,
): OpenAI.Responses.ResponseCreateParams {
  return {
    model: MORNING_BRIEF_OPENAI_MODEL,
    store: false,
    stream: false,
    reasoning: { effort: MORNING_BRIEF_OPENAI_REASONING_EFFORT },
    max_output_tokens: MORNING_BRIEF_OPENAI_MAX_OUTPUT_TOKENS,
    instructions,
    input: [{ role: "user", content: prompt }],
  };
}

export function classifyIncompleteResponseCategory(
  reason: string | null | undefined,
): IncompleteResponseCategory {
  if (reason === "max_output_tokens") {
    return INCOMPLETE_RESPONSE_CATEGORIES.maxOutputTokensExhausted;
  }

  return INCOMPLETE_RESPONSE_CATEGORIES.incompleteOther;
}

export function isIncompleteMorningBriefResponse(
  response: OpenAI.Responses.Response,
): boolean {
  return response.status === "incomplete";
}

export function buildMorningBriefOpenAiResponseDiagnostic(
  response: OpenAI.Responses.Response,
  extractedLength: number,
): MorningBriefOpenAiResponseDiagnostic {
  const incompleteReason = response.incomplete_details?.reason ?? null;

  return {
    responseStatus: response.status ?? "unknown",
    incompleteReason,
    ...(response.status === "incomplete"
      ? { incompleteCategory: classifyIncompleteResponseCategory(incompleteReason) }
      : {}),
    outputTokens: response.usage?.output_tokens ?? null,
    reasoningTokens:
      response.usage?.output_tokens_details?.reasoning_tokens ?? null,
    extractedLength,
  };
}

export type MorningBriefOpenAiEvaluation =
  | {
      kind: "incomplete";
      diagnostic: MorningBriefOpenAiResponseDiagnostic;
    }
  | {
      kind: "empty";
      diagnostic: MorningBriefOpenAiResponseDiagnostic;
    }
  | {
      kind: "ok";
      extractedText: string;
      diagnostic: MorningBriefOpenAiResponseDiagnostic;
    };

export function evaluateMorningBriefOpenAiResponse(
  response: OpenAI.Responses.Response,
): MorningBriefOpenAiEvaluation {
  const extractedText = extractResponseText(response);
  const diagnostic = buildMorningBriefOpenAiResponseDiagnostic(
    response,
    extractedText.length,
  );

  if (isIncompleteMorningBriefResponse(response)) {
    return { kind: "incomplete", diagnostic };
  }

  if (!extractedText) {
    return { kind: "empty", diagnostic };
  }

  return { kind: "ok", extractedText, diagnostic };
}
