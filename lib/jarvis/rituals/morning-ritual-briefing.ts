import "server-only";

import {
  hasValidTimelineForAudioHash,
  isValidMorningBriefAudioTimeline,
} from "@/lib/jarvis/briefings/build-morning-brief-audio-timeline";
import type { MorningBriefAudioTimeline } from "@/lib/jarvis/briefings/audio-timeline-types";
import { resolveMorningBriefRecommendation } from "@/lib/jarvis/briefings/morning-brief-recommendation";
import type { MorningBriefRecommendedMode } from "@/lib/jarvis/briefings/morning-brief-recommendation-types";
import { segmentMorningBriefSentences } from "@/lib/jarvis/briefings/segment-morning-brief-sentences";
import {
  selectDisplayedMorningBriefingRow,
} from "@/lib/jarvis/dashboard/load-command-center";
import {
  getLocalDateString,
  resolveTimeZone,
} from "@/lib/jarvis/dashboard/command-center-utils";
import type { SupabaseClient } from "@supabase/supabase-js";

const DURATION_TOLERANCE_MS = 250;

export type MorningRitualBriefingAudioStatus =
  | "none"
  | "pending"
  | "generating"
  | "ready"
  | "failed";

export type MorningRitualBriefingTimelineSentence = {
  index: number;
  text: string;
  startMs: number;
  endMs: number;
};

export type MorningRitualBriefingTimeline = {
  durationMs: number;
  sentences: MorningRitualBriefingTimelineSentence[];
};

export type MorningRitualBriefing = {
  briefingDate: string;
  transcript: string;
  audioStatus: MorningRitualBriefingAudioStatus;
  audioGeneratedAt: string | null;
  timeline: MorningRitualBriefingTimeline | null;
  recommendedMode: MorningBriefRecommendedMode | null;
  recommendationSentenceIndex: number | null;
};

export type MorningRitualPlaybackReadiness =
  | "ready"
  | "no_brief"
  | "audio_not_ready"
  | "timeline_missing";

export type MorningBriefingRowForRitual = {
  briefing_date: string;
  status: string;
  content: string | null;
  audio_status: string;
  audio_generated_at: string | null;
  audio_content_hash: string | null;
  audio_timeline: unknown;
  audio_timeline_content_hash: string | null;
  audio_duration_ms: number | null;
  audio_timeline_generated_at: string | null;
  audio_timeline_model: string | null;
  audio_timeline_error_code: string | null;
  recommended_mode: unknown;
  recommendation_sentence_index: unknown;
};

const RITUAL_BRIEFING_SELECT =
  "briefing_date, status, content, audio_status, audio_generated_at, audio_content_hash, audio_timeline, audio_timeline_content_hash, audio_duration_ms, audio_timeline_generated_at, audio_timeline_model, audio_timeline_error_code, recommended_mode, recommendation_sentence_index";

export function parseMorningRitualBriefingAudioStatus(
  value: string,
): MorningRitualBriefingAudioStatus {
  if (
    value === "pending" ||
    value === "generating" ||
    value === "ready" ||
    value === "failed"
  ) {
    return value;
  }

  return "none";
}

function isCompletedBriefingContent(row: MorningBriefingRowForRitual): boolean {
  return row.status === "completed" && Boolean(row.content?.trim());
}

export function validateMorningRitualBriefingTimeline(
  row: Pick<
    MorningBriefingRowForRitual,
    | "audio_status"
    | "audio_content_hash"
    | "audio_timeline"
    | "audio_timeline_content_hash"
    | "audio_duration_ms"
    | "audio_timeline_generated_at"
    | "audio_timeline_model"
    | "audio_timeline_error_code"
  >,
  content: string,
): MorningRitualBriefingTimeline | null {
  if (row.audio_status !== "ready" || !row.audio_content_hash) {
    return null;
  }

  if (!hasValidTimelineForAudioHash(row, row.audio_content_hash)) {
    return null;
  }

  const timeline = row.audio_timeline as MorningBriefAudioTimeline;
  const durationMs = row.audio_duration_ms as number;

  if (!isValidMorningBriefAudioTimeline(timeline)) {
    return null;
  }

  const canonicalSentences = segmentMorningBriefSentences(content);

  if (timeline.sentences.length !== canonicalSentences.length) {
    return null;
  }

  for (let index = 0; index < timeline.sentences.length; index += 1) {
    const sentence = timeline.sentences[index];

    if (sentence.index !== index) {
      return null;
    }

    if (sentence.text !== canonicalSentences[index]) {
      return null;
    }

    if (sentence.endMs > durationMs + DURATION_TOLERANCE_MS) {
      return null;
    }
  }

  return {
    durationMs,
    sentences: timeline.sentences.map((sentence) => ({
      index: sentence.index,
      text: sentence.text,
      startMs: sentence.startMs,
      endMs: sentence.endMs,
    })),
  };
}

export function buildMorningRitualBriefingFromRow(
  row: MorningBriefingRowForRitual,
): MorningRitualBriefing | null {
  if (!isCompletedBriefingContent(row)) {
    return null;
  }

  const transcript = row.content!.trim();
  const timeline = validateMorningRitualBriefingTimeline(row, transcript);
  const recommendation = resolveMorningBriefRecommendation({
    content: transcript,
    persistedRecommendedMode: row.recommended_mode,
    persistedRecommendationSentenceIndex: row.recommendation_sentence_index,
  });

  return {
    briefingDate: row.briefing_date,
    transcript,
    audioStatus: parseMorningRitualBriefingAudioStatus(row.audio_status),
    audioGeneratedAt: row.audio_generated_at,
    timeline,
    recommendedMode: recommendation?.recommendedMode ?? null,
    recommendationSentenceIndex:
      recommendation?.recommendationSentenceIndex ?? null,
  };
}

export function resolveMorningRitualPlaybackReadiness(
  briefing: MorningRitualBriefing | null,
): MorningRitualPlaybackReadiness {
  if (!briefing) {
    return "no_brief";
  }

  if (briefing.audioStatus !== "ready") {
    return "audio_not_ready";
  }

  if (!briefing.timeline) {
    return "timeline_missing";
  }

  return "ready";
}

export function isMorningBriefingReadyForRitualStart(
  row: MorningBriefingRowForRitual | null,
): row is MorningBriefingRowForRitual {
  if (!row || !isCompletedBriefingContent(row)) {
    return false;
  }

  const transcript = row.content!.trim();

  return (
    row.audio_status === "ready" &&
    validateMorningRitualBriefingTimeline(row, transcript) !== null
  );
}

export async function loadMorningBriefingForRitualByDate({
  supabase,
  userId,
  briefingDate,
}: {
  supabase: SupabaseClient;
  userId: string;
  briefingDate: string;
}): Promise<MorningRitualBriefing | null> {
  const { data, error } = await supabase
    .from("morning_briefings")
    .select(RITUAL_BRIEFING_SELECT)
    .eq("user_id", userId)
    .eq("briefing_date", briefingDate)
    .maybeSingle();

  if (error) {
    throw new Error("Could not load morning briefing.");
  }

  if (!data) {
    return null;
  }

  return buildMorningRitualBriefingFromRow(data as MorningBriefingRowForRitual);
}

export async function loadDisplayedMorningBriefingForRitual({
  supabase,
  userId,
  now = new Date(),
}: {
  supabase: SupabaseClient;
  userId: string;
  now?: Date;
}): Promise<MorningRitualBriefing | null> {
  const { data: profile, error: profileError } = await supabase
    .from("jarvis_profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error("Could not load user profile.");
  }

  const timezone = resolveTimeZone(profile?.timezone);
  const todayDate = getLocalDateString(timezone, now);

  const [todayResult, latestCompletedResult] = await Promise.all([
    supabase
      .from("morning_briefings")
      .select(RITUAL_BRIEFING_SELECT)
      .eq("user_id", userId)
      .eq("briefing_date", todayDate)
      .maybeSingle(),
    supabase
      .from("morning_briefings")
      .select(RITUAL_BRIEFING_SELECT)
      .eq("user_id", userId)
      .eq("status", "completed")
      .not("content", "is", null)
      .order("briefing_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (todayResult.error || latestCompletedResult.error) {
    throw new Error("Could not load morning briefing.");
  }

  const selectedRow = selectDisplayedMorningBriefingRow(
    (todayResult.data as MorningBriefingRowForRitual | null) ?? null,
    (latestCompletedResult.data as MorningBriefingRowForRitual | null) ?? null,
  );

  if (!selectedRow) {
    return null;
  }

  return buildMorningRitualBriefingFromRow(selectedRow);
}
