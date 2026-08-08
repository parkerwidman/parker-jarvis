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
  type MorningBriefRecommendationMetadata,
  type MorningBriefRecommendedMode,
} from "@/lib/jarvis/briefings/morning-brief-recommendation-types";

export type {
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

export function resolveMorningBriefRecommendedModeFromPriority(input: {
  topPriority: MorningBriefTopPriority | null;
  tasks: MorningBriefTask[];
  currentFocus: string | null;
  melusiProjectTaskIds: ReadonlySet<string>;
}): MorningBriefRecommendedMode | null {
  if (!input.topPriority) {
    return null;
  }

  const sourceTask = findPrioritySourceTask({
    topPriority: input.topPriority,
    tasks: input.tasks,
    currentFocus: input.currentFocus,
  });

  if (!sourceTask) {
    return null;
  }

  if (isMelusiLifeArea(sourceTask.lifeAreaName)) {
    return "melusi";
  }

  if (
    sourceTask.projectId &&
    input.melusiProjectTaskIds.has(sourceTask.projectId)
  ) {
    return "melusi";
  }

  if (sourceTask.lifeAreaName) {
    return "personal";
  }

  return null;
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
  mode: MorningBriefRecommendedMode,
): string {
  if (mode === "melusi") {
    return "I'd run Melusi mode this morning.";
  }

  return "Personal mode makes the most sense this morning.";
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
  recommendedMode: MorningBriefRecommendedMode,
): string {
  const normalized = content.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return buildMorningBriefModeRecommendationSentence(recommendedMode);
  }

  const sentences = segmentMorningBriefSentences(normalized);
  const oppositeMode: MorningBriefRecommendedMode =
    recommendedMode === "melusi" ? "personal" : "melusi";
  const recommendationIndexes: number[] = [];
  const targetIndexes: number[] = [];
  const oppositeIndexes: number[] = [];

  for (let index = 0; index < sentences.length; index += 1) {
    const isTarget = sentenceContainsExplicitModeRecommendation(
      sentences[index],
      recommendedMode,
    );
    const isOpposite = sentenceContainsExplicitModeRecommendation(
      sentences[index],
      oppositeMode,
    );

    if (!isTarget && !isOpposite) {
      continue;
    }

    recommendationIndexes.push(index);

    if (isTarget) {
      targetIndexes.push(index);
    }

    if (isOpposite) {
      oppositeIndexes.push(index);
    }
  }

  if (recommendationIndexes.length === 0) {
    return `${normalized} ${buildMorningBriefModeRecommendationSentence(recommendedMode)}`;
  }

  if (
    targetIndexes.length === 1 &&
    oppositeIndexes.length === 0 &&
    recommendationIndexes.length === 1
  ) {
    return normalized;
  }

  const canonical = buildMorningBriefModeRecommendationSentence(recommendedMode);
  const preserved = sentences.filter(
    (_, index) => !recommendationIndexes.includes(index),
  );

  preserved.push(canonical);

  return preserved.join(" ");
}

export function buildMorningBriefRecommendationMetadata(
  content: string,
  recommendedMode: MorningBriefRecommendedMode | null,
): MorningBriefRecommendationMetadata | null {
  if (!recommendedMode) {
    return null;
  }

  const finalContent = ensureMorningBriefModeRecommendation(
    content,
    recommendedMode,
  );
  const sentenceIndex = findRecommendationSentenceIndex(
    finalContent,
    recommendedMode,
  );

  if (sentenceIndex === null) {
    return null;
  }

  return {
    recommendedMode,
    recommendationSentenceIndex: sentenceIndex,
  };
}

export function finalizeMorningBriefRecommendation(input: {
  content: string;
  recommendedMode: MorningBriefRecommendedMode | null;
}): {
  content: string;
  metadata: MorningBriefRecommendationMetadata | null;
} {
  if (!input.recommendedMode) {
    return {
      content: input.content.replace(/\s+/g, " ").trim(),
      metadata: null,
    };
  }

  const content = ensureMorningBriefModeRecommendation(
    input.content,
    input.recommendedMode,
  );
  const metadata = buildMorningBriefRecommendationMetadata(
    content,
    input.recommendedMode,
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
