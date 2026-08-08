import "server-only";

import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  RateLimitError,
} from "openai";

import {
  MORNING_BRIEF_TIMELINE_WHISPER_MODEL,
  type WordTimestamp,
  type WordTimestampsResult,
} from "@/lib/jarvis/briefings/audio-timeline-types";

export type CreateWordTimestampsResult =
  | { success: true; result: WordTimestampsResult }
  | { success: false; errorCode: "timeline_transcription_failed" };

function getOpenAiClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new OpenAI({ apiKey });
}

function parseWordTimestamps(
  words: unknown,
): WordTimestamp[] | null {
  if (!Array.isArray(words) || words.length === 0) {
    return null;
  }

  const parsed: WordTimestamp[] = [];

  for (const entry of words) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { word?: unknown }).word !== "string" ||
      typeof (entry as { start?: unknown }).start !== "number" ||
      typeof (entry as { end?: unknown }).end !== "number"
    ) {
      return null;
    }

    const wordEntry = entry as { word: string; start: number; end: number };

    if (
      !Number.isFinite(wordEntry.start) ||
      !Number.isFinite(wordEntry.end) ||
      wordEntry.start < 0 ||
      wordEntry.end < wordEntry.start
    ) {
      return null;
    }

    parsed.push({
      word: wordEntry.word,
      start: wordEntry.start,
      end: wordEntry.end,
    });
  }

  for (let index = 1; index < parsed.length; index += 1) {
    if (parsed[index].start < parsed[index - 1].start) {
      return null;
    }
  }

  return parsed;
}

function resolveDurationSeconds(
  duration: unknown,
  words: WordTimestamp[],
): number | null {
  if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
    return duration;
  }

  const lastWord = words[words.length - 1];

  if (lastWord && Number.isFinite(lastWord.end) && lastWord.end > 0) {
    return lastWord.end;
  }

  return null;
}

export async function createWordTimestamps(
  audioBytes: Uint8Array,
  options: {
    transcript?: string;
    client?: OpenAI;
  } = {},
): Promise<CreateWordTimestampsResult> {
  if (audioBytes.byteLength === 0) {
    return { success: false, errorCode: "timeline_transcription_failed" };
  }

  const openai = options.client ?? getOpenAiClient();

  if (!openai) {
    return { success: false, errorCode: "timeline_transcription_failed" };
  }

  try {
    const fileBytes = new Uint8Array(audioBytes);
    const file = new File([fileBytes], "morning-brief.mp3", {
      type: "audio/mpeg",
    });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: MORNING_BRIEF_TIMELINE_WHISPER_MODEL,
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
      ...(options.transcript ? { prompt: options.transcript } : {}),
    });

    const words = parseWordTimestamps(
      (transcription as { words?: unknown }).words,
    );

    if (!words) {
      return { success: false, errorCode: "timeline_transcription_failed" };
    }

    const durationSeconds = resolveDurationSeconds(
      (transcription as { duration?: unknown }).duration,
      words,
    );

    if (!durationSeconds) {
      return { success: false, errorCode: "timeline_transcription_failed" };
    }

    return {
      success: true,
      result: {
        durationSeconds,
        words,
      },
    };
  } catch (error) {
    if (
      error instanceof APIConnectionTimeoutError ||
      error instanceof RateLimitError ||
      error instanceof APIConnectionError
    ) {
      return { success: false, errorCode: "timeline_transcription_failed" };
    }

    return { success: false, errorCode: "timeline_transcription_failed" };
  }
}
