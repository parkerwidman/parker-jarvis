import type { RitualMode } from "@/lib/jarvis/morning-ritual/ring-geometry";
import type {
  MorningRitualBriefing,
  MorningRitualBriefingTimeline,
  MorningRitualBriefingTimelineSentence,
  MorningRitualPlaybackReadiness,
} from "@/lib/jarvis/rituals/morning-ritual-briefing";
import type { MorningRitualState } from "@/lib/jarvis/rituals/load-morning-ritual-entry";

export type RitualPlaybackSnapshot = {
  /** -1 before the first sentence startMs is reached. */
  activeSentenceIndex: number;
  recommendedMode: RitualMode | null;
  modeRevealed: boolean;
  isPlaying: boolean;
  audioEnded: boolean;
};

export type MorningRitualStartResult =
  | "started"
  | "already_started"
  | "already_completed";

export type MorningRitualCompleteResult = "completed" | "already_completed";

export function extractTranscriptSentences(
  timeline: MorningRitualBriefingTimeline,
): readonly string[] {
  return timeline.sentences.map((sentence) => sentence.text);
}

export function resolveActiveSentenceIndex(
  currentTimeMs: number,
  sentences: readonly MorningRitualBriefingTimelineSentence[],
): number {
  if (sentences.length === 0) {
    return -1;
  }

  if (currentTimeMs < sentences[0].startMs) {
    return -1;
  }

  let activeIndex = sentences[0].index;

  for (const sentence of sentences) {
    if (currentTimeMs >= sentence.startMs) {
      activeIndex = sentence.index;
    } else {
      break;
    }
  }

  return activeIndex;
}

export function isMorningRitualStartAcknowledgedResult(
  result: MorningRitualStartResult,
): boolean {
  return result === "started" || result === "already_started";
}

export function createInitialStartAcknowledged(
  ritualStatus: "not_started" | "started" | "completed",
): boolean {
  return ritualStatus === "started";
}

export function shouldRetryPlaybackWithStartPost(
  startAcknowledged: boolean,
): boolean {
  return !startAcknowledged;
}

export function shouldRequestCompletion(options: {
  audioEnded: boolean;
  startAcknowledged: boolean;
}): boolean {
  return options.audioEnded && options.startAcknowledged;
}

export function shouldApplySignedUrlToAudio(options: {
  playbackSessionLocked: boolean;
  fetchGeneration: number;
  fetchGenerationAtStart: number;
  unmounted: boolean;
}): boolean {
  if (options.unmounted) {
    return false;
  }

  if (options.playbackSessionLocked) {
    return false;
  }

  return options.fetchGeneration === options.fetchGenerationAtStart;
}

export function resolveRecommendationStartMs(
  timeline: MorningRitualBriefingTimeline,
  recommendationSentenceIndex: number | null,
): number | null {
  if (recommendationSentenceIndex === null) {
    return null;
  }

  if (
    recommendationSentenceIndex < 0 ||
    recommendationSentenceIndex >= timeline.sentences.length
  ) {
    return null;
  }

  return timeline.sentences[recommendationSentenceIndex]?.startMs ?? null;
}

export function resolveModeRevealed(
  currentTimeMs: number,
  recommendedMode: RitualMode | null,
  recommendationSentenceIndex: number | null,
  timeline: MorningRitualBriefingTimeline,
): boolean {
  if (!recommendedMode || recommendationSentenceIndex === null) {
    return false;
  }

  const startMs = resolveRecommendationStartMs(
    timeline,
    recommendationSentenceIndex,
  );

  if (startMs === null) {
    return false;
  }

  return currentTimeMs >= startMs;
}

export function deriveRitualPlaybackSnapshot(options: {
  currentTimeMs: number;
  timeline: MorningRitualBriefingTimeline;
  recommendedMode: RitualMode | null;
  recommendationSentenceIndex: number | null;
  isPlaying: boolean;
  audioEnded: boolean;
}): RitualPlaybackSnapshot {
  const activeSentenceIndex = resolveActiveSentenceIndex(
    options.currentTimeMs,
    options.timeline.sentences,
  );
  const modeRevealed = resolveModeRevealed(
    options.currentTimeMs,
    options.recommendedMode,
    options.recommendationSentenceIndex,
    options.timeline,
  );

  return {
    activeSentenceIndex,
    recommendedMode: options.recommendedMode,
    modeRevealed,
    isPlaying: options.isPlaying && !options.audioEnded,
    audioEnded: options.audioEnded,
  };
}

export function shouldPreloadMorningRitualAudio(options: {
  ritualState: MorningRitualState;
  playbackReadiness: MorningRitualPlaybackReadiness;
  briefing: MorningRitualBriefing | null;
}): boolean {
  return (
    options.ritualState === "full_required" &&
    options.playbackReadiness === "ready" &&
    options.briefing !== null &&
    options.briefing.timeline !== null
  );
}

export function canStartMorningRitual(options: {
  playbackReadiness: MorningRitualPlaybackReadiness;
  briefing: MorningRitualBriefing | null;
  audioPrepared: boolean;
  startInFlight: boolean;
}): boolean {
  return (
    options.playbackReadiness === "ready" &&
    options.briefing !== null &&
    options.briefing.timeline !== null &&
    options.audioPrepared &&
    !options.startInFlight
  );
}

export function resolvePlaybackReadinessMessage(
  playbackReadiness: MorningRitualPlaybackReadiness,
): string | null {
  switch (playbackReadiness) {
    case "no_brief":
      return "Morning Brief isn't ready yet";
    case "audio_not_ready":
      return "Morning Brief audio is still preparing";
    case "timeline_missing":
      return "Morning Brief is still preparing";
    case "ready":
      return null;
    default:
      return "Morning Brief isn't ready yet";
  }
}

export function parseMorningRitualStartResponse(payload: {
  result?: string;
  error?: string;
}):
  | { ok: true; result: MorningRitualStartResult }
  | { ok: false; reason: string } {
  if (
    payload.result === "started" ||
    payload.result === "already_started" ||
    payload.result === "already_completed"
  ) {
    return { ok: true, result: payload.result };
  }

  return { ok: false, reason: payload.error ?? "unavailable" };
}

export function parseMorningRitualCompleteResponse(payload: {
  result?: string;
  error?: string;
}):
  | { ok: true; result: MorningRitualCompleteResult }
  | { ok: false; reason: string } {
  if (payload.result === "completed" || payload.result === "already_completed") {
    return { ok: true, result: payload.result };
  }

  return { ok: false, reason: payload.error ?? "unavailable" };
}

export function shouldRevealEnterJarvis(options: {
  completionAcknowledged: boolean;
  audioEnded: boolean;
}): boolean {
  return options.completionAcknowledged && options.audioEnded;
}

export function computeSignedUrlRefreshDelayMs(
  expiresInSeconds: number,
  bufferSeconds: number,
): number {
  const effectiveSeconds = Math.max(1, expiresInSeconds - bufferSeconds);
  return effectiveSeconds * 1000;
}

export function isAutoplayNotAllowedError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "AbortError")
  );
}
