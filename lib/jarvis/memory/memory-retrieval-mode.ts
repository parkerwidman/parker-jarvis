import "server-only";

import {
  detectRequestedMainToolDomains,
  isAmbiguousPlanningRequest,
  isPureGeneralKnowledgeRequest,
} from "@/lib/jarvis/agents/dynamic-tool-exposure";
import type { JarvisContextTarget } from "@/lib/jarvis/context/types";
import type { ConversationActiveEntity } from "@/lib/jarvis/context-engine/context-types";

export type MemoryRetrievalMode = "lexical" | "hybrid";

const EXPLICIT_RECALL_PATTERNS = [
  /\bdo you remember\b/,
  /\bwhat did i (?:tell|say|mention)\b/,
  /\bwhat have i said\b/,
  /\bbased on what you know about me\b/,
  /\bfrom what you know about me\b/,
  /\bwhat did i tell you before\b/,
  /\bwhat did i say before\b/,
  /\bwhat have i told you\b/,
  /\bhave i (?:ever )?(?:said|mentioned|told you)\b/,
  /\bwhat do you know about my\b/,
  /\brecall what i\b/,
];

const PERSONAL_PREFERENCE_PATTERNS = [
  /\bwhat kind of\b.+\b(?:suit|fit|prefer|work for) me\b/,
  /\bwhich (?:kind|type|option).+\b(?:suit|fit|prefer)\b/,
  /\bwhat would probably suit me\b/,
  /\bwhat usually fits me\b/,
  /\bwhat do i usually prefer\b/,
  /\bwhat do i tend to prefer\b/,
  /\bwhat fits my preferences\b/,
  /\bwhat matches my preferences\b/,
  /\bwhat kind of .+ would suit me\b/,
  /\bwhich .+ would probably suit me\b/,
  /\bwhat vibe would suit me\b/,
  /\bwhat style would fit me\b/,
  /\bwhat launch timing\b.+\bpreferences\b/,
  /\bwhich .+ fits my preferences\b/,
];

const OPERATIONAL_READ_PATTERNS = [
  /\bwhat(?:'s| is) on my (?:schedule|calendar|outlook)\b/,
  /\bwhat does my day\b/,
  /\bwhat should i focus on\b/,
  /\bwhat tasks\b/,
  /\bmy tasks\b/,
  /\bopen tasks\b/,
  /\btodo list\b/,
  /\bexplain compound interest\b/,
];

function normalizeMessage(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, " ");
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function buildMemoryRetrievalQuery(input: {
  currentMessage: string;
  rollingSummary: string;
  activeEntities: ConversationActiveEntity[];
  unresolvedQuestions: string[];
}): string {
  const parts = [input.currentMessage.trim()];

  const normalized = normalizeMessage(input.currentMessage);
  const needsReferent =
    /\b(that|this|it|those|these)\b/.test(normalized) ||
    /\bwhat did i say about\b/.test(normalized);

  if (needsReferent) {
    if (input.activeEntities.length > 0) {
      parts.push(
        `Active entities: ${input.activeEntities
          .map((entity) => `${entity.type} ${entity.name}`)
          .join(", ")}`,
      );
    }

    const openQuestion = input.unresolvedQuestions.find(
      (question) => question.trim().length > 0,
    );

    if (openQuestion) {
      parts.push(`Open question: ${openQuestion.trim()}`);
    }

    const summarySnippet = input.rollingSummary.trim().slice(0, 400);

    if (summarySnippet.length > 0) {
      parts.push(`Conversation summary: ${summarySnippet}`);
    }
  }

  return parts.join("\n").slice(0, 2_000);
}

export function resolveMemoryRetrievalMode(input: {
  message: string;
  contextTarget: JarvisContextTarget | null;
}): MemoryRetrievalMode {
  const normalized = normalizeMessage(input.message);

  if (!normalized) {
    return "lexical";
  }

  if (includesAny(normalized, EXPLICIT_RECALL_PATTERNS)) {
    return "hybrid";
  }

  if (includesAny(normalized, PERSONAL_PREFERENCE_PATTERNS)) {
    return "hybrid";
  }

  if (
    /\b(?:prefer|preference|preferences|usually|typically|tend to)\b/.test(
      normalized,
    ) &&
    /\b(?:my|me|i)\b/.test(normalized)
  ) {
    return "hybrid";
  }

  if (isPureGeneralKnowledgeRequest(input.message)) {
    return "lexical";
  }

  if (includesAny(normalized, OPERATIONAL_READ_PATTERNS)) {
    return "lexical";
  }

  const domains = detectRequestedMainToolDomains(
    input.message,
    input.contextTarget,
  );

  const operationalDomains =
    domains.has("schedule_read") ||
    domains.has("schedule_write") ||
    domains.has("tasks") ||
    domains.has("outlook_calendar") ||
    domains.has("outlook_inbox") ||
    domains.has("personal_finance") ||
    domains.has("melusi_expenses") ||
    domains.has("projects");

  if (
    operationalDomains &&
    !includesAny(normalized, EXPLICIT_RECALL_PATTERNS) &&
    !includesAny(normalized, PERSONAL_PREFERENCE_PATTERNS)
  ) {
    return "lexical";
  }

  if (isAmbiguousPlanningRequest(input.message)) {
    return "lexical";
  }

  return "lexical";
}
