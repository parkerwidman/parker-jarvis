import { isMelusiLifeArea } from "@/lib/jarvis/dashboard/command-center-mode";
import { segmentMorningBriefSentences } from "@/lib/jarvis/briefings/segment-morning-brief-sentences";
import {
  taskMatchesCurrentFocus,
} from "@/lib/jarvis/briefings/morning-brief-task-policy";
import type {
  MorningBriefTask,
  MorningBriefTopPriority,
} from "@/lib/jarvis/briefings/morning-brief-structure";
import {
  MORNING_BRIEF_RECOMMENDED_MODE_VALUES,
  type MorningBriefRecommendationContext,
  type MorningBriefRecommendationMetadata,
  type MorningBriefRecommendedMode,
} from "@/lib/jarvis/briefings/morning-brief-recommendation-types";

export type {
  MorningBriefRecommendationContext,
  MorningBriefRecommendationMetadata,
  MorningBriefRecommendedMode,
} from "@/lib/jarvis/briefings/morning-brief-recommendation-types";

export {
  MORNING_BRIEF_RECOMMENDED_MODE_VALUES,
} from "@/lib/jarvis/briefings/morning-brief-recommendation-types";

const PERSONAL_MODE_PHRASE = "Personal mode";
const MELUSI_MODE_PHRASE = "Melusi mode";

const EXPLICIT_MODE_PATTERNS: Record<
  MorningBriefRecommendedMode,
  RegExp
> = {
  personal: /\bPersonal mode\b/i,
  melusi: /\bMelusi mode\b/i,
};

export function isMorningBriefRecommendedMode(
  value: unknown,
): value is MorningBriefRecommendedMode {
  return (
    typeof value === "string" &&
    (MORNING_BRIEF_RECOMMENDED_MODE_VALUES as readonly string[]).includes(value)
  );
}

export function parseMorningBriefRecommendedMode(
  value: unknown,
): MorningBriefRecommendedMode | null {
  return isMorningBriefRecommendedMode(value) ? value : null;
}

function normalizePhrase(value: string): string {
  return value.trim().toLowerCase();
}

const MAX_PRIORITY_TITLE_LENGTH = 120;

function findPrioritySourceTask(input: {
  topPriority: MorningBriefTopPriority;
  tasks: MorningBriefTask[];
  currentFocus: string | null;
}): MorningBriefTask | null {
  const priorityPhrase = normalizePhrase(input.topPriority.phrase);

  const phraseMatch = input.tasks.find(
    (task) => normalizePhrase(task.title) === priorityPhrase,
  );

  if (phraseMatch) {
    return phraseMatch;
  }

  if (input.topPriority.source === "profile_focus") {
    return (
      input.tasks.find((task) =>
        taskMatchesCurrentFocus(task.title, input.currentFocus),
      ) ?? null
    );
  }

  return null;
}

function resolveRecommendedModeFromSourceTask(input: {
  sourceTask: MorningBriefTask;
  melusiProjectTaskIds: ReadonlySet<string>;
}): MorningBriefRecommendedMode | null {
  if (isMelusiLifeArea(input.sourceTask.lifeAreaName)) {
    return "melusi";
  }

  if (
    input.sourceTask.projectId &&
    input.melusiProjectTaskIds.has(input.sourceTask.projectId)
  ) {
    return "melusi";
  }

  if (input.sourceTask.lifeAreaName) {
    return "personal";
  }

  return null;
}

function resolveMorningBriefPrioritySource(input: {
  topPriority: MorningBriefTopPriority;
  tasks: MorningBriefTask[];
  currentFocus: string | null;
  melusiProjectTaskIds: ReadonlySet<string>;
}): {
  task: MorningBriefTask;
  recommendedMode: MorningBriefRecommendedMode;
} | null {
  const sourceTask = findPrioritySourceTask({
    topPriority: input.topPriority,
    tasks: input.tasks,
    currentFocus: input.currentFocus,
  });

  if (!sourceTask) {
    return null;
  }

  const recommendedMode = resolveRecommendedModeFromSourceTask({
    sourceTask,
    melusiProjectTaskIds: input.melusiProjectTaskIds,
  });

  if (!recommendedMode) {
    return null;
  }

  return {
    task: sourceTask,
    recommendedMode,
  };
}

export function resolveMorningBriefRecommendedModeFromPriority(input: {
  topPriority: MorningBriefTopPriority | null;
  tasks: MorningBriefTask[];
  currentFocus: string | null;
  melusiProjectTaskIds: ReadonlySet<string>;
}): MorningBriefRecommendedMode | null {
  if (!input.topPriority) {
    return null;
  }

  return (
    resolveMorningBriefPrioritySource({
      topPriority: input.topPriority,
      tasks: input.tasks,
      currentFocus: input.currentFocus,
      melusiProjectTaskIds: input.melusiProjectTaskIds,
    })?.recommendedMode ?? null
  );
}

export function sanitizePriorityTitleForRecommendationReason(
  title: string,
): string {
  let sanitized = title.trim().replace(/\s+/g, " ");

  if (!sanitized) {
    return "";
  }

  sanitized = sanitized.replace(/[.!?]+$/u, "");

  if (sanitized.length > MAX_PRIORITY_TITLE_LENGTH) {
    const truncated = sanitized.slice(0, MAX_PRIORITY_TITLE_LENGTH);
    const lastSpace = truncated.lastIndexOf(" ");

    sanitized =
      lastSpace > 0 ? truncated.slice(0, lastSpace).trim() : truncated.trim();
  }

  return sanitized;
}

/** @deprecated Prefer sanitizePriorityTitleForRecommendationReason */
export function formatPriorityPhraseForRecommendationReason(
  phrase: string,
): string {
  return sanitizePriorityTitleForRecommendationReason(phrase);
}

export function buildMorningBriefRecommendationReason(
  priorityTitle: string,
): string {
  const sanitizedTitle = sanitizePriorityTitleForRecommendationReason(
    priorityTitle,
  );

  if (!sanitizedTitle) {
    return "";
  }

  return `your top priority is ${sanitizedTitle}`;
}

export function resolveMorningBriefRecommendationContextFromPriority(input: {
  topPriority: MorningBriefTopPriority | null;
  tasks: MorningBriefTask[];
  currentFocus: string | null;
  melusiProjectTaskIds: ReadonlySet<string>;
}): MorningBriefRecommendationContext | null {
  if (!input.topPriority) {
    return null;
  }

  const prioritySource = resolveMorningBriefPrioritySource({
    topPriority: input.topPriority,
    tasks: input.tasks,
    currentFocus: input.currentFocus,
    melusiProjectTaskIds: input.melusiProjectTaskIds,
  });

  if (!prioritySource) {
    return null;
  }

  const reason = buildMorningBriefRecommendationReason(
    prioritySource.task.title,
  );

  if (!reason) {
    return null;
  }

  return {
    recommendedMode: prioritySource.recommendedMode,
    reason,
  };
}

export function sentenceContainsExplicitModeRecommendation(
  sentence: string,
  mode: MorningBriefRecommendedMode,
): boolean {
  return EXPLICIT_MODE_PATTERNS[mode].test(sentence);
}

export function findRecommendationSentenceIndex(
  content: string,
  mode: MorningBriefRecommendedMode,
): number | null {
  const sentences = segmentMorningBriefSentences(content);

  for (let index = 0; index < sentences.length; index += 1) {
    if (sentenceContainsExplicitModeRecommendation(sentences[index], mode)) {
      return index;
    }
  }

  return null;
}

function collectExplicitRecommendationSentenceIndexes(
  content: string,
): Array<{ mode: MorningBriefRecommendedMode; index: number }> {
  const sentences = segmentMorningBriefSentences(content);
  const matches: Array<{ mode: MorningBriefRecommendedMode; index: number }> =
    [];

  for (let index = 0; index < sentences.length; index += 1) {
    for (const mode of MORNING_BRIEF_RECOMMENDED_MODE_VALUES) {
      if (sentenceContainsExplicitModeRecommendation(sentences[index], mode)) {
        matches.push({ mode, index });
      }
    }
  }

  return matches;
}

export function deriveMorningBriefRecommendationFromTranscript(
  content: string,
): MorningBriefRecommendationMetadata | null {
  const matches = collectExplicitRecommendationSentenceIndexes(content);

  if (matches.length === 0) {
    return null;
  }

  const uniqueModes = new Set(matches.map((match) => match.mode));

  if (uniqueModes.size !== 1) {
    return null;
  }

  const [mode] = uniqueModes;
  const indexesForMode = matches
    .filter((match) => match.mode === mode)
    .map((match) => match.index);

  if (indexesForMode.length !== 1) {
    return null;
  }

  return {
    recommendedMode: mode,
    recommendationSentenceIndex: indexesForMode[0],
  };
}

export function buildMorningBriefModeRecommendationSentence(
  context: MorningBriefRecommendationContext,
): string {
  const modePhrase = getExplicitModePhrase(context.recommendedMode);

  return `I suggest ${modePhrase} today because ${context.reason}.`;
}

export function contentHasExplicitModeRecommendation(
  content: string,
  mode?: MorningBriefRecommendedMode,
): boolean {
  if (mode) {
    return findRecommendationSentenceIndex(content, mode) !== null;
  }

  return deriveMorningBriefRecommendationFromTranscript(content) !== null;
}

export function ensureMorningBriefModeRecommendation(
  content: string,
  context: MorningBriefRecommendationContext,
): string {
  const recommendedMode = context.recommendedMode;
  const normalized = content.replace(/\s+/g, " ").trim();
  const canonical = buildMorningBriefModeRecommendationSentence(context);

  if (!normalized) {
    return canonical;
  }

  const sentences = segmentMorningBriefSentences(normalized);
  const oppositeMode: MorningBriefRecommendedMode =
    recommendedMode === "melusi" ? "personal" : "melusi";
  const recommendationIndexes: number[] = [];

  for (let index = 0; index < sentences.length; index += 1) {
    const isTarget = sentenceContainsExplicitModeRecommendation(
      sentences[index],
      recommendedMode,
    );
    const isOpposite = sentenceContainsExplicitModeRecommendation(
      sentences[index],
      oppositeMode,
    );

    if (isTarget || isOpposite) {
      recommendationIndexes.push(index);
    }
  }

  if (recommendationIndexes.length === 0) {
    return `${normalized} ${canonical}`;
  }

  const preserved = sentences.filter(
    (_, index) => !recommendationIndexes.includes(index),
  );

  preserved.push(canonical);

  return preserved.join(" ");
}

export function buildMorningBriefRecommendationMetadata(
  content: string,
  context: MorningBriefRecommendationContext | null,
): MorningBriefRecommendationMetadata | null {
  if (!context) {
    return null;
  }

  const finalContent = ensureMorningBriefModeRecommendation(content, context);
  const sentenceIndex = findRecommendationSentenceIndex(
    finalContent,
    context.recommendedMode,
  );

  if (sentenceIndex === null) {
    return null;
  }

  return {
    recommendedMode: context.recommendedMode,
    recommendationSentenceIndex: sentenceIndex,
  };
}

export function finalizeMorningBriefRecommendation(input: {
  content: string;
  recommendationContext: MorningBriefRecommendationContext | null;
}): {
  content: string;
  metadata: MorningBriefRecommendationMetadata | null;
} {
  if (!input.recommendationContext) {
    return {
      content: input.content.replace(/\s+/g, " ").trim(),
      metadata: null,
    };
  }

  const content = ensureMorningBriefModeRecommendation(
    input.content,
    input.recommendationContext,
  );
  const metadata = buildMorningBriefRecommendationMetadata(
    content,
    input.recommendationContext,
  );

  return {
    content,
    metadata,
  };
}

function parseNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
}

function isPersistedRecommendationFieldAbsent(value: unknown): boolean {
  return value == null;
}

export function resolveMorningBriefRecommendation(input: {
  content: string;
  persistedRecommendedMode: unknown;
  persistedRecommendationSentenceIndex: unknown;
}): MorningBriefRecommendationMetadata | null {
  const modeAbsent = isPersistedRecommendationFieldAbsent(
    input.persistedRecommendedMode,
  );
  const indexAbsent = isPersistedRecommendationFieldAbsent(
    input.persistedRecommendationSentenceIndex,
  );

  if (modeAbsent && indexAbsent) {
    return deriveMorningBriefRecommendationFromTranscript(input.content);
  }

  if (modeAbsent !== indexAbsent) {
    return null;
  }

  const parsedMode = parseMorningBriefRecommendedMode(
    input.persistedRecommendedMode,
  );
  const parsedIndex = parseNonNegativeInteger(
    input.persistedRecommendationSentenceIndex,
  );

  if (parsedMode === null || parsedIndex === null) {
    return null;
  }

  const sentences = segmentMorningBriefSentences(input.content);

  if (parsedIndex >= sentences.length) {
    return null;
  }

  if (
    !sentenceContainsExplicitModeRecommendation(sentences[parsedIndex], parsedMode)
  ) {
    return null;
  }

  return {
    recommendedMode: parsedMode,
    recommendationSentenceIndex: parsedIndex,
  };
}

export function getExplicitModePhrase(mode: MorningBriefRecommendedMode): string {
  return mode === "melusi" ? MELUSI_MODE_PHRASE : PERSONAL_MODE_PHRASE;
}
