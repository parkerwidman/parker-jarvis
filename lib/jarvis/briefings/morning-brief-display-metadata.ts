import {
  findPriorityPhraseRangeWithFallback,
} from "@/lib/jarvis/briefings/format-brief-transcript";
import type { MorningBriefPlan } from "@/lib/jarvis/briefings/morning-brief-structure";

export type MorningBriefDisplayMetadata = {
  priorityText: string | null;
};

export function getCanonicalPriorityTextFromPlan(
  plan: MorningBriefPlan,
): string | null {
  return plan.canonicalPriorityText?.trim() || plan.topPriority?.phrase?.trim() || null;
}

export function extractBriefDisplayMetadata(
  sourceCounts: unknown,
): MorningBriefDisplayMetadata {
  if (
    !sourceCounts ||
    typeof sourceCounts !== "object" ||
    Array.isArray(sourceCounts)
  ) {
    return { priorityText: null };
  }

  const briefDisplay = (sourceCounts as Record<string, unknown>).briefDisplay;

  if (
    !briefDisplay ||
    typeof briefDisplay !== "object" ||
    Array.isArray(briefDisplay)
  ) {
    return { priorityText: null };
  }

  const priorityText = (briefDisplay as Record<string, unknown>).priorityText;

  return {
    priorityText: typeof priorityText === "string" ? priorityText : null,
  };
}

export function mergeBriefDisplayIntoSourceCounts(
  sourceCounts: Record<string, unknown>,
  display: MorningBriefDisplayMetadata,
): Record<string, unknown> {
  return {
    ...sourceCounts,
    briefDisplay: {
      priorityText: display.priorityText,
    },
  };
}

export function validateBriefPriorityTextPresence(
  content: string,
  priorityText: string | null | undefined,
): boolean {
  const normalizedPriority = priorityText?.trim();

  if (!normalizedPriority) {
    return true;
  }

  return findPriorityPhraseRangeWithFallback(content, normalizedPriority) !== null;
}

export function resolveBriefPriorityText(input: {
  sourceCounts: unknown;
  transcript: string | null;
  currentFocus: string | null;
  focusTaskTitle: string | null;
}): string | null {
  const stored = extractBriefDisplayMetadata(input.sourceCounts).priorityText?.trim();

  if (stored) {
    return stored;
  }

  if (!input.transcript?.trim()) {
    return null;
  }

  const fallbackCandidates = [
    input.currentFocus?.trim(),
    input.focusTaskTitle?.trim(),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of fallbackCandidates) {
    if (findPriorityPhraseRangeWithFallback(input.transcript, candidate)) {
      return candidate;
    }
  }

  return null;
}
