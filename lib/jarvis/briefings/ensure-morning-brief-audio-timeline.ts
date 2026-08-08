import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  MORNING_BRIEF_TIMELINE_ERROR_CODES,
  type MorningBriefAudioTimeline,
  type MorningBriefTimelineErrorCode,
} from "@/lib/jarvis/briefings/audio-timeline-types";
import {
  buildMorningBriefAudioTimeline,
  hasValidTimelineForAudioHash,
} from "@/lib/jarvis/briefings/build-morning-brief-audio-timeline";
import {
  buildMorningBriefAudioStoragePath,
  isMorningBriefAudioStoragePath,
  isValidBriefingDate,
  MORNING_BRIEF_AUDIO_BUCKET,
} from "@/lib/jarvis/audio/storage-path";
import { createAutomationClient } from "@/lib/supabase/automation";

export type EnsureMorningBriefAudioTimelineResult =
  | {
      resultCode: "ready";
      timeline: MorningBriefAudioTimeline;
      durationMs: number;
      contentHash: string;
      reused: boolean;
    }
  | {
      resultCode:
        | "audio_not_ready"
        | "briefing_not_found"
        | "invalid_input"
        | MorningBriefTimelineErrorCode;
      contentHash?: string;
    };

type TimelineRow = {
  content: string | null;
  audio_status: string;
  audio_content_hash: string | null;
  audio_storage_path: string | null;
  audio_timeline: unknown;
  audio_timeline_content_hash: string | null;
  audio_duration_ms: number | null;
  audio_timeline_generated_at: string | null;
  audio_timeline_model: string | null;
  audio_timeline_error_code: string | null;
};

type EnsureMorningBriefAudioTimelineDeps = {
  automationClient?: SupabaseClient;
  downloadAudio?: (
    supabase: SupabaseClient,
    storagePath: string,
  ) => Promise<Uint8Array | null>;
  buildTimeline?: typeof buildMorningBriefAudioTimeline;
  now?: () => Date;
};

function logTimelineDiagnostic(details: {
  stage: string;
  resultCode: string;
  reused?: boolean;
}): void {
  console.info("[morning-brief-audio-timeline]", {
    stage: details.stage,
    resultCode: details.resultCode,
    ...(details.reused !== undefined ? { reused: details.reused } : {}),
  });
}

async function loadTimelineRow(
  supabase: SupabaseClient,
  userId: string,
  briefingDate: string,
): Promise<TimelineRow | null> {
  const { data, error } = await supabase
    .from("morning_briefings")
    .select(
      "content, audio_status, audio_content_hash, audio_storage_path, audio_timeline, audio_timeline_content_hash, audio_duration_ms, audio_timeline_generated_at, audio_timeline_model, audio_timeline_error_code",
    )
    .eq("user_id", userId)
    .eq("briefing_date", briefingDate)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as TimelineRow;
}

async function downloadMorningBriefAudioBytes(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage
    .from(MORNING_BRIEF_AUDIO_BUCKET)
    .download(storagePath);

  if (error || !data) {
    return null;
  }

  const buffer = await data.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  return bytes.byteLength > 0 ? bytes : null;
}

async function persistTimelineSuccess(
  supabase: SupabaseClient,
  userId: string,
  briefingDate: string,
  contentHash: string,
  timeline: MorningBriefAudioTimeline,
  durationMs: number,
  model: string,
  generatedAt: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("morning_briefings")
    .update({
      audio_timeline: timeline,
      audio_timeline_content_hash: contentHash,
      audio_duration_ms: durationMs,
      audio_timeline_generated_at: generatedAt,
      audio_timeline_model: model,
      audio_timeline_error_code: null,
    })
    .eq("user_id", userId)
    .eq("briefing_date", briefingDate)
    .eq("audio_status", "ready")
    .eq("audio_content_hash", contentHash)
    .or(
      `audio_timeline_content_hash.is.null,audio_timeline_content_hash.neq.${contentHash},audio_timeline.is.null`,
    )
    .select("id")
    .maybeSingle();

  return !error && !!data;
}

async function persistTimelineFailure(
  supabase: SupabaseClient,
  userId: string,
  briefingDate: string,
  contentHash: string,
  errorCode: MorningBriefTimelineErrorCode,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("morning_briefings")
    .update({
      audio_timeline: null,
      audio_timeline_content_hash: null,
      audio_duration_ms: null,
      audio_timeline_generated_at: null,
      audio_timeline_model: null,
      audio_timeline_error_code: errorCode,
    })
    .eq("user_id", userId)
    .eq("briefing_date", briefingDate)
    .eq("audio_status", "ready")
    .eq("audio_content_hash", contentHash)
    .or(
      `audio_timeline_content_hash.is.null,audio_timeline_content_hash.neq.${contentHash},audio_timeline.is.null`,
    )
    .select("id")
    .maybeSingle();

  return !error && !!data;
}

async function canPersistTimelineForAudioHash(
  supabase: SupabaseClient,
  userId: string,
  briefingDate: string,
  contentHash: string,
): Promise<
  | { ok: true; row: TimelineRow }
  | { ok: false; reason: "missing" | "stale_hash" | "valid_timeline" }
> {
  const row = await loadTimelineRow(supabase, userId, briefingDate);

  if (!row) {
    return { ok: false, reason: "missing" };
  }

  if (row.audio_content_hash !== contentHash || row.audio_status !== "ready") {
    return { ok: false, reason: "stale_hash" };
  }

  if (hasValidTimelineForAudioHash(row, contentHash)) {
    return { ok: false, reason: "valid_timeline" };
  }

  return { ok: true, row };
}

export async function generateAndPersistMorningBriefAudioTimeline(input: {
  supabase: SupabaseClient;
  userId: string;
  briefingDate: string;
  normalizedSpokenContent: string;
  contentHash: string;
  audioBytes: Uint8Array;
  buildTimeline?: typeof buildMorningBriefAudioTimeline;
  now?: () => Date;
}): Promise<
  | { success: true; reused: boolean }
  | { success: false; errorCode: MorningBriefTimelineErrorCode }
  | { success: true; skipped: true; reused: true }
> {
  const row = await loadTimelineRow(
    input.supabase,
    input.userId,
    input.briefingDate,
  );

  if (
    row &&
    hasValidTimelineForAudioHash(row, input.contentHash)
  ) {
    return { success: true, skipped: true, reused: true };
  }

  if (
    !row ||
    row.audio_status !== "ready" ||
    row.audio_content_hash !== input.contentHash ||
    row.content !== input.normalizedSpokenContent
  ) {
    return {
      success: false,
      errorCode: MORNING_BRIEF_TIMELINE_ERROR_CODES.invalid,
    };
  }

  const buildTimeline = input.buildTimeline ?? buildMorningBriefAudioTimeline;
  const built = await buildTimeline(
    input.audioBytes,
    input.normalizedSpokenContent,
  );

  if (!built.success) {
    const persistEligibility = await canPersistTimelineForAudioHash(
      input.supabase,
      input.userId,
      input.briefingDate,
      input.contentHash,
    );

    if (persistEligibility.ok === false) {
      if (persistEligibility.reason === "valid_timeline") {
        return { success: true, skipped: true, reused: true };
      }

      return {
        success: false,
        errorCode: MORNING_BRIEF_TIMELINE_ERROR_CODES.invalid,
      };
    }

    await persistTimelineFailure(
      input.supabase,
      input.userId,
      input.briefingDate,
      input.contentHash,
      built.errorCode,
    );
    return { success: false, errorCode: built.errorCode };
  }

  const persistEligibility = await canPersistTimelineForAudioHash(
    input.supabase,
    input.userId,
    input.briefingDate,
    input.contentHash,
  );

  if (persistEligibility.ok === false) {
    if (persistEligibility.reason === "valid_timeline") {
      return { success: true, skipped: true, reused: true };
    }

    return {
      success: false,
      errorCode: MORNING_BRIEF_TIMELINE_ERROR_CODES.invalid,
    };
  }

  const generatedAt = (input.now ?? (() => new Date()))().toISOString();
  const persisted = await persistTimelineSuccess(
    input.supabase,
    input.userId,
    input.briefingDate,
    input.contentHash,
    built.timeline,
    built.durationMs,
    built.model,
    generatedAt,
  );

  if (!persisted) {
    const latest = await loadTimelineRow(
      input.supabase,
      input.userId,
      input.briefingDate,
    );

    if (latest && hasValidTimelineForAudioHash(latest, input.contentHash)) {
      return { success: true, skipped: true, reused: true };
    }

    return {
      success: false,
      errorCode: MORNING_BRIEF_TIMELINE_ERROR_CODES.invalid,
    };
  }

  return { success: true, reused: false };
}

export async function ensureMorningBriefAudioTimeline(
  input: { userId: string; briefingDate: string },
  deps: EnsureMorningBriefAudioTimelineDeps = {},
): Promise<EnsureMorningBriefAudioTimelineResult> {
  if (!isValidBriefingDate(input.briefingDate)) {
    const result: EnsureMorningBriefAudioTimelineResult = {
      resultCode: "invalid_input",
    };
    logTimelineDiagnostic({ stage: "validation", resultCode: result.resultCode });
    return result;
  }

  let supabase: SupabaseClient;

  try {
    supabase = deps.automationClient ?? createAutomationClient();
  } catch {
    const result: EnsureMorningBriefAudioTimelineResult = {
      resultCode: MORNING_BRIEF_TIMELINE_ERROR_CODES.invalid,
    };
    logTimelineDiagnostic({
      stage: "automation_client",
      resultCode: result.resultCode,
    });
    return result;
  }

  const row = await loadTimelineRow(
    supabase,
    input.userId,
    input.briefingDate,
  );

  if (!row) {
    const result: EnsureMorningBriefAudioTimelineResult = {
      resultCode: "briefing_not_found",
    };
    logTimelineDiagnostic({
      stage: "briefing_lookup",
      resultCode: result.resultCode,
    });
    return result;
  }

  if (
    row.audio_status !== "ready" ||
    !row.audio_content_hash ||
    !row.audio_storage_path
  ) {
    const result: EnsureMorningBriefAudioTimelineResult = {
      resultCode: "audio_not_ready",
      contentHash: row.audio_content_hash ?? undefined,
    };
    logTimelineDiagnostic({ stage: "audio_state", resultCode: result.resultCode });
    return result;
  }

  const contentHash = row.audio_content_hash;

  if (hasValidTimelineForAudioHash(row, contentHash)) {
    const result: EnsureMorningBriefAudioTimelineResult = {
      resultCode: "ready",
      timeline: row.audio_timeline as MorningBriefAudioTimeline,
      durationMs: row.audio_duration_ms as number,
      contentHash,
      reused: true,
    };
    logTimelineDiagnostic({
      stage: "idempotency",
      resultCode: result.resultCode,
      reused: true,
    });
    return result;
  }

  if (
    !isMorningBriefAudioStoragePath(
      row.audio_storage_path,
      input.userId,
      input.briefingDate,
    ) ||
    row.audio_storage_path !==
      buildMorningBriefAudioStoragePath(
        input.userId,
        input.briefingDate,
        contentHash,
      )
  ) {
    const result: EnsureMorningBriefAudioTimelineResult = {
      resultCode: MORNING_BRIEF_TIMELINE_ERROR_CODES.invalid,
      contentHash,
    };
    logTimelineDiagnostic({ stage: "path_validation", resultCode: result.resultCode });
    return result;
  }

  const downloadAudio =
    deps.downloadAudio ??
    ((client, storagePath) =>
      downloadMorningBriefAudioBytes(client, storagePath));

  const audioBytes = await downloadAudio(supabase, row.audio_storage_path);

  if (!audioBytes) {
    await persistTimelineFailure(
      supabase,
      input.userId,
      input.briefingDate,
      contentHash,
      MORNING_BRIEF_TIMELINE_ERROR_CODES.storageDownloadFailed,
    );
    const result: EnsureMorningBriefAudioTimelineResult = {
      resultCode: MORNING_BRIEF_TIMELINE_ERROR_CODES.storageDownloadFailed,
      contentHash,
    };
    logTimelineDiagnostic({ stage: "storage_download", resultCode: result.resultCode });
    return result;
  }

  const spokenContent = row.content?.trim() ?? "";

  if (!spokenContent) {
    const result: EnsureMorningBriefAudioTimelineResult = {
      resultCode: MORNING_BRIEF_TIMELINE_ERROR_CODES.invalid,
      contentHash,
    };
    logTimelineDiagnostic({ stage: "content_validation", resultCode: result.resultCode });
    return result;
  }

  const buildTimeline = deps.buildTimeline ?? buildMorningBriefAudioTimeline;
  const built = await buildTimeline(audioBytes, spokenContent);

  if (!built.success) {
    const persistEligibility = await canPersistTimelineForAudioHash(
      supabase,
      input.userId,
      input.briefingDate,
      contentHash,
    );

    if (persistEligibility.ok === false) {
      if (persistEligibility.reason === "valid_timeline") {
        const result: EnsureMorningBriefAudioTimelineResult = {
          resultCode: "ready",
          timeline: row.audio_timeline as MorningBriefAudioTimeline,
          durationMs: row.audio_duration_ms as number,
          contentHash,
          reused: true,
        };
        logTimelineDiagnostic({
          stage: "timeline_build",
          resultCode: result.resultCode,
          reused: true,
        });
        return result;
      }

      const result: EnsureMorningBriefAudioTimelineResult = {
        resultCode: MORNING_BRIEF_TIMELINE_ERROR_CODES.invalid,
        contentHash,
      };
      logTimelineDiagnostic({ stage: "timeline_build", resultCode: result.resultCode });
      return result;
    }

    await persistTimelineFailure(
      supabase,
      input.userId,
      input.briefingDate,
      contentHash,
      built.errorCode,
    );
    const result: EnsureMorningBriefAudioTimelineResult = {
      resultCode: built.errorCode,
      contentHash,
    };
    logTimelineDiagnostic({ stage: "timeline_build", resultCode: result.resultCode });
    return result;
  }

  const persistEligibility = await canPersistTimelineForAudioHash(
    supabase,
    input.userId,
    input.briefingDate,
    contentHash,
  );

  if (persistEligibility.ok === false) {
    if (persistEligibility.reason === "valid_timeline") {
      const latest = await loadTimelineRow(supabase, input.userId, input.briefingDate);
      const result: EnsureMorningBriefAudioTimelineResult = {
        resultCode: "ready",
        timeline: latest!.audio_timeline as MorningBriefAudioTimeline,
        durationMs: latest!.audio_duration_ms as number,
        contentHash,
        reused: true,
      };
      logTimelineDiagnostic({
        stage: "pre_persistence_recheck",
        resultCode: result.resultCode,
        reused: true,
      });
      return result;
    }

    const result: EnsureMorningBriefAudioTimelineResult = {
      resultCode: MORNING_BRIEF_TIMELINE_ERROR_CODES.invalid,
      contentHash,
    };
    logTimelineDiagnostic({ stage: "pre_persistence_recheck", resultCode: result.resultCode });
    return result;
  }

  const generatedAt = (deps.now ?? (() => new Date()))().toISOString();
  const persisted = await persistTimelineSuccess(
    supabase,
    input.userId,
    input.briefingDate,
    contentHash,
    built.timeline,
    built.durationMs,
    built.model,
    generatedAt,
  );

  if (!persisted) {
    const latest = await loadTimelineRow(supabase, input.userId, input.briefingDate);

    if (latest && hasValidTimelineForAudioHash(latest, contentHash)) {
      const result: EnsureMorningBriefAudioTimelineResult = {
        resultCode: "ready",
        timeline: latest.audio_timeline as MorningBriefAudioTimeline,
        durationMs: latest.audio_duration_ms as number,
        contentHash,
        reused: true,
      };
      logTimelineDiagnostic({
        stage: "persistence_recovery",
        resultCode: result.resultCode,
        reused: true,
      });
      return result;
    }

    const result: EnsureMorningBriefAudioTimelineResult = {
      resultCode: MORNING_BRIEF_TIMELINE_ERROR_CODES.invalid,
      contentHash,
    };
    logTimelineDiagnostic({ stage: "persistence", resultCode: result.resultCode });
    return result;
  }

  const result: EnsureMorningBriefAudioTimelineResult = {
    resultCode: "ready",
    timeline: built.timeline,
    durationMs: built.durationMs,
    contentHash,
    reused: false,
  };
  logTimelineDiagnostic({
    stage: "complete",
    resultCode: result.resultCode,
    reused: false,
  });
  return result;
}
