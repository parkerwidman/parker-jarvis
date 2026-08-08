export const MORNING_BRIEF_AUDIO_TIMELINE_VERSION = 1 as const;

export const MORNING_BRIEF_TIMELINE_WHISPER_MODEL = "whisper-1" as const;

export type WordTimestamp = {
  word: string;
  start: number;
  end: number;
};

export type WordTimestampsResult = {
  durationSeconds: number;
  words: WordTimestamp[];
};

export type MorningBriefSentenceTiming = {
  index: number;
  text: string;
  startMs: number;
  endMs: number;
};

export type MorningBriefAudioTimeline = {
  version: typeof MORNING_BRIEF_AUDIO_TIMELINE_VERSION;
  sentences: MorningBriefSentenceTiming[];
};

export const MORNING_BRIEF_TIMELINE_ERROR_CODES = {
  transcriptionFailed: "timeline_transcription_failed",
  alignmentFailed: "timeline_alignment_failed",
  storageDownloadFailed: "timeline_storage_download_failed",
  invalid: "timeline_invalid",
} as const;

export type MorningBriefTimelineErrorCode =
  (typeof MORNING_BRIEF_TIMELINE_ERROR_CODES)[keyof typeof MORNING_BRIEF_TIMELINE_ERROR_CODES];

export const MORNING_BRIEF_TIMELINE_ERROR_CODE_VALUES = Object.values(
  MORNING_BRIEF_TIMELINE_ERROR_CODES,
);
