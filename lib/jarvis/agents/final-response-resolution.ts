import type OpenAI from "openai";

import { extractResponseText } from "@/lib/jarvis/agents/agent-diagnostics";

export type FinalTextReconciliation = {
  streamedText: string;
  authoritativeText: string;
  finalText: string;
  reconciled: boolean;
};

export function reconcileFinalRoundText(input: {
  streamedText: string;
  response: OpenAI.Responses.Response;
}): FinalTextReconciliation {
  const authoritativeText = extractResponseText(input.response);
  const streamedText = input.streamedText.trim();
  const finalText =
    authoritativeText.length > 0
      ? authoritativeText
      : streamedText;

  return {
    streamedText,
    authoritativeText,
    finalText,
    reconciled:
      authoritativeText.length > 0 && authoritativeText !== streamedText,
  };
}

export type WriteAttemptSummary = {
  attempted: number;
  succeeded: number;
  failed: number;
  attemptedTools: string[];
};

export function createWriteAttemptSummary(): WriteAttemptSummary {
  return {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    attemptedTools: [],
  };
}

export function recordWriteAttempt(
  summary: WriteAttemptSummary,
  toolName: string,
  toolOutput: string,
): void {
  summary.attempted += 1;
  summary.attemptedTools.push(toolName);

  try {
    const parsed = JSON.parse(toolOutput) as { success?: boolean };

    if (parsed.success === true) {
      summary.succeeded += 1;
      return;
    }

    summary.failed += 1;
  } catch {
    summary.failed += 1;
  }
}

export function buildEmptyFinalFallback(summary: WriteAttemptSummary): string {
  if (summary.attempted === 0) {
    return "I couldn't produce a readable response. Please try again.";
  }

  if (summary.failed === 0 && summary.succeeded > 0) {
    return "I completed the requested action step, but I couldn't produce the final response. Please check the affected item in Jarvis before retrying so we don't duplicate anything.";
  }

  if (summary.succeeded > 0 && summary.failed > 0) {
    return "Some action steps completed and others did not, but I couldn't produce the final response. Please review the affected items in Jarvis before retrying so we don't duplicate anything.";
  }

  return "An action step was attempted, but I couldn't produce the final response. Please check the affected item in Jarvis before retrying so we don't duplicate anything.";
}
