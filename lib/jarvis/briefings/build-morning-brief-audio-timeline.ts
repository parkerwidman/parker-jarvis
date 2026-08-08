import {
  MORNING_BRIEF_TIMELINE_ERROR_CODES,
  MORNING_BRIEF_TIMELINE_WHISPER_MODEL,
  type MorningBriefAudioTimeline,
  type MorningBriefTimelineErrorCode,
} from "@/lib/jarvis/briefings/audio-timeline-types";
import { alignSentenceTimings } from "@/lib/jarvis/briefings/align-sentence-timings";
import {
  createWordTimestamps,
  type CreateWordTimestampsResult,
} from "@/lib/jarvis/audio/create-word-timestamps";

export type BuildMorningBriefAudioTimelineResult =
  | {
      success: true;
      timeline: MorningBriefAudioTimeline;
      durationMs: number;
      model: string;
    }
  | { success: false; errorCode: MorningBriefTimelineErrorCode };

type BuildMorningBriefAudioTimelineDeps = {
  createWordTimestamps?: (
    audioBytes: Uint8Array,
    options?: { transcript?: string },
  ) => Promise<CreateWordTimestampsResult>;
};

export async function buildMorningBriefAudioTimeline(
  audioBytes: Uint8Array,
  spokenContent: string,
  deps: BuildMorningBriefAudioTimelineDeps = {},
): Promise<BuildMorningBriefAudioTimelineResult> {
  const transcribe = deps.createWordTimestamps ?? createWordTimestamps;
  const transcription = await transcribe(audioBytes, {
    transcript: spokenContent,
  });

  if (!transcription.success) {
    return {
      success: false,
      errorCode: transcription.errorCode,
    };
  }

  const alignment = alignSentenceTimings(
    spokenContent,
    transcription.result.words,
    transcription.result.durationSeconds,
  );

  if (!alignment.success) {
    return {
      success: false,
      errorCode:
        alignment.reason === "invalid_timestamps"
          ? MORNING_BRIEF_TIMELINE_ERROR_CODES.invalid
          : MORNING_BRIEF_TIMELINE_ERROR_CODES.alignmentFailed,
    };
  }

  return {
    success: true,
    timeline: alignment.timeline,
    durationMs: alignment.durationMs,
    model: MORNING_BRIEF_TIMELINE_WHISPER_MODEL,
  };
}

export function isValidMorningBriefAudioTimeline(
  timeline: unknown,
): timeline is MorningBriefAudioTimeline {
  if (typeof timeline !== "object" || timeline === null) {
    return false;
  }

  const candidate = timeline as MorningBriefAudioTimeline;

  if (candidate.version !== 1 || !Array.isArray(candidate.sentences)) {
    return false;
  }

  if (candidate.sentences.length === 0) {
    return false;
  }

  let previousEndMs = -1;

  for (const sentence of candidate.sentences) {
    if (
      typeof sentence.index !== "number" ||
      typeof sentence.text !== "string" ||
      sentence.text.trim().length === 0 ||
      typeof sentence.startMs !== "number" ||
      typeof sentence.endMs !== "number" ||
      !Number.isFinite(sentence.startMs) ||
      !Number.isFinite(sentence.endMs) ||
      sentence.startMs < 0 ||
      sentence.endMs < sentence.startMs ||
      sentence.startMs < previousEndMs
    ) {
      return false;
    }

    previousEndMs = sentence.endMs;
  }

  return true;
}

export function hasValidTimelineForAudioHash(
  row: {
    audio_timeline: unknown;
    audio_timeline_content_hash: string | null;
    audio_duration_ms: number | null;
    audio_timeline_generated_at: string | null;
    audio_timeline_model: string | null;
    audio_timeline_error_code: string | null;
  },
  audioContentHash: string,
): boolean {
  return (
    row.audio_timeline_content_hash === audioContentHash &&
    row.audio_timeline_error_code === null &&
    typeof row.audio_duration_ms === "number" &&
    row.audio_duration_ms > 0 &&
    typeof row.audio_timeline_generated_at === "string" &&
    row.audio_timeline_generated_at.length > 0 &&
    typeof row.audio_timeline_model === "string" &&
    row.audio_timeline_model.trim().length > 0 &&
    isValidMorningBriefAudioTimeline(row.audio_timeline)
  );
}
