import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSpeechAudio } from "@/lib/jarvis/audio/create-speech";
import { computeTtsContentHash } from "@/lib/jarvis/audio/content-hash";
import {
  buildMorningBriefAudioStoragePath,
  isMorningBriefAudioStoragePath,
  isValidBriefingDate,
  MORNING_BRIEF_AUDIO_BUCKET,
} from "@/lib/jarvis/audio/storage-path";
import { resolveMorningBriefTtsConfig } from "@/lib/jarvis/audio/tts-config";
import { createAutomationClient } from "@/lib/supabase/automation";

export const MORNING_BRIEF_AUDIO_ERROR_CODES = {
  invalidInput: "invalid_input",
  briefingNotFound: "briefing_not_found",
  briefingChanged: "briefing_changed",
  generationInProgress: "generation_in_progress",
  ttsTimeout: "tts_timeout",
  ttsRateLimited: "tts_rate_limited",
  ttsFailed: "tts_failed",
  emptyAudio: "empty_audio",
  storageUploadFailed: "storage_upload_failed",
  persistenceFailed: "persistence_failed",
} as const;

export type MorningBriefAudioErrorCode =
  (typeof MORNING_BRIEF_AUDIO_ERROR_CODES)[keyof typeof MORNING_BRIEF_AUDIO_ERROR_CODES];

export type MorningBriefAudioResultCode =
  | "already_ready"
  | "ready"
  | "generation_in_progress"
  | MorningBriefAudioErrorCode;

export type GenerateMorningBriefAudioResult = {
  resultCode: MorningBriefAudioResultCode;
  contentHash?: string;
  reused?: boolean;
};

type BriefingAudioRow = {
  content: string | null;
  audio_status: string;
  audio_content_hash: string | null;
  audio_storage_path: string | null;
  audio_generation_started_at: string | null;
};

export const MORNING_BRIEF_AUDIO_GENERATION_STALE_MS = 10 * 60 * 1000;

export type GenerateMorningBriefAudioInput = {
  userId: string;
  briefingDate: string;
  normalizedSpokenContent: string;
};

type GenerateMorningBriefAudioDeps = {
  automationClient?: SupabaseClient;
  createSpeech?: typeof createSpeechAudio;
  now?: () => Date;
};

function logMorningBriefAudioDiagnostic(details: {
  stage: string;
  resultCode: MorningBriefAudioResultCode;
  model?: string;
  reused?: boolean;
}): void {
  console.info("[morning-brief-audio]", {
    stage: details.stage,
    resultCode: details.resultCode,
    ...(details.model ? { model: details.model } : {}),
    ...(details.reused !== undefined ? { reused: details.reused } : {}),
  });
}

function isReadyWithMatchingHash(
  row: BriefingAudioRow,
  contentHash: string,
): boolean {
  return (
    row.audio_status === "ready" &&
    row.audio_content_hash === contentHash &&
    typeof row.audio_storage_path === "string" &&
    row.audio_storage_path.trim().length > 0
  );
}

export function timestampsRepresentSameInstant(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (left == null || right == null) {
    return false;
  }

  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);

  if (Number.isNaN(leftMs) || Number.isNaN(rightMs)) {
    return false;
  }

  return leftMs === rightMs;
}

function ownsGenerationClaim(
  row: BriefingAudioRow,
  normalizedSpokenContent: string,
  contentHash: string,
  claimStartedAt: string,
): boolean {
  return (
    row.content === normalizedSpokenContent &&
    row.audio_status === "generating" &&
    row.audio_content_hash === contentHash &&
    timestampsRepresentSameInstant(row.audio_generation_started_at, claimStartedAt)
  );
}

export type ClaimAudioGenerationResult =
  | { status: "claimed"; claimStartedAt: string }
  | { status: "already_ready" }
  | { status: "generation_in_progress" }
  | { status: "briefing_changed" };

function resolveLostOwnershipResult(
  row: BriefingAudioRow | null,
  contentHash: string,
): GenerateMorningBriefAudioResult {
  if (row && isReadyWithMatchingHash(row, contentHash)) {
    return {
      resultCode: "already_ready",
      contentHash,
      reused: true,
    };
  }

  return {
    resultCode: "generation_in_progress",
    contentHash,
  };
}

async function loadBriefingAudioRow(
  supabase: SupabaseClient,
  userId: string,
  briefingDate: string,
): Promise<BriefingAudioRow | null> {
  const { data, error } = await supabase
    .from("morning_briefings")
    .select(
      "content, audio_status, audio_content_hash, audio_storage_path, audio_generation_started_at",
    )
    .eq("user_id", userId)
    .eq("briefing_date", briefingDate)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as BriefingAudioRow;
}

function readPersistedClaimStartedAt(
  row: { audio_generation_started_at?: string | null },
): string | null {
  const claimStartedAt = row.audio_generation_started_at;
  return typeof claimStartedAt === "string" && claimStartedAt.length > 0
    ? claimStartedAt
    : null;
}

async function claimAudioGeneration(
  supabase: SupabaseClient,
  userId: string,
  briefingDate: string,
  normalizedSpokenContent: string,
  contentHash: string,
  claimStartedAt: string,
  staleBeforeIso: string,
): Promise<ClaimAudioGenerationResult> {
  const { data, error } = await supabase
    .from("morning_briefings")
    .update({
      audio_status: "generating",
      audio_content_hash: contentHash,
      audio_generation_started_at: claimStartedAt,
      audio_error_code: null,
    })
    .eq("user_id", userId)
    .eq("briefing_date", briefingDate)
    .eq("content", normalizedSpokenContent)
    .or(
      `audio_status.in.(none,pending,failed),and(audio_status.eq.ready,audio_content_hash.neq.${contentHash}),and(audio_status.eq.generating,audio_content_hash.neq.${contentHash})`,
    )
    .select("id, audio_generation_started_at")
    .maybeSingle();

  if (error) {
    return { status: "generation_in_progress" };
  }

  const initialClaimStartedAt = readPersistedClaimStartedAt(data ?? {});
  if (initialClaimStartedAt) {
    return { status: "claimed", claimStartedAt: initialClaimStartedAt };
  }

  const row = await loadBriefingAudioRow(supabase, userId, briefingDate);

  if (!row) {
    return { status: "briefing_changed" };
  }

  if (row.content !== normalizedSpokenContent) {
    return { status: "briefing_changed" };
  }

  if (isReadyWithMatchingHash(row, contentHash)) {
    return { status: "already_ready" };
  }

  if (row.audio_status === "generating" && row.audio_content_hash === contentHash) {
    if (
      row.audio_generation_started_at &&
      row.audio_generation_started_at > staleBeforeIso
    ) {
      return { status: "generation_in_progress" };
    }

    const { data: reclaimed, error: reclaimError } = await supabase
      .from("morning_briefings")
      .update({
        audio_status: "generating",
        audio_content_hash: contentHash,
        audio_generation_started_at: claimStartedAt,
        audio_error_code: null,
      })
      .eq("user_id", userId)
      .eq("briefing_date", briefingDate)
      .eq("content", normalizedSpokenContent)
      .eq("audio_status", "generating")
      .eq("audio_content_hash", contentHash)
      .lte("audio_generation_started_at", staleBeforeIso)
      .select("id, audio_generation_started_at")
      .maybeSingle();

    const reclaimedClaimStartedAt = readPersistedClaimStartedAt(reclaimed ?? {});
    if (!reclaimError && reclaimedClaimStartedAt) {
      return { status: "claimed", claimStartedAt: reclaimedClaimStartedAt };
    }

    return { status: "generation_in_progress" };
  }

  return { status: "generation_in_progress" };
}

async function persistAudioFailure(
  supabase: SupabaseClient,
  userId: string,
  briefingDate: string,
  normalizedSpokenContent: string,
  contentHash: string,
  claimStartedAt: string,
  errorCode: MorningBriefAudioErrorCode,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("morning_briefings")
    .update({
      audio_status: "failed",
      audio_error_code: errorCode,
      audio_content_hash: contentHash,
      audio_generation_started_at: null,
    })
    .eq("user_id", userId)
    .eq("briefing_date", briefingDate)
    .eq("content", normalizedSpokenContent)
    .eq("audio_status", "generating")
    .eq("audio_content_hash", contentHash)
    .eq("audio_generation_started_at", claimStartedAt)
    .select("id")
    .maybeSingle();

  return !error && !!data;
}

async function uploadMorningBriefAudio(
  supabase: SupabaseClient,
  storagePath: string,
  audioBytes: Uint8Array,
): Promise<boolean> {
  const { error } = await supabase.storage
    .from(MORNING_BRIEF_AUDIO_BUCKET)
    .upload(storagePath, audioBytes, {
      contentType: "audio/mpeg",
      upsert: true,
    });

  return !error;
}

async function deleteMorningBriefAudioObjectBestEffort(
  supabase: SupabaseClient,
  storagePath: string,
  userId: string,
  briefingDate: string,
  protectedStoragePath?: string,
): Promise<void> {
  if (protectedStoragePath && storagePath === protectedStoragePath) {
    return;
  }

  if (!isMorningBriefAudioStoragePath(storagePath, userId, briefingDate)) {
    return;
  }

  try {
    await supabase.storage.from(MORNING_BRIEF_AUDIO_BUCKET).remove([storagePath]);
  } catch {
    console.info("[morning-brief-audio]", {
      stage: "storage_cleanup",
      resultCode: "storage_cleanup_failed",
    });
  }
}

async function verifyGenerationOwnership(
  supabase: SupabaseClient,
  userId: string,
  briefingDate: string,
  normalizedSpokenContent: string,
  contentHash: string,
  claimStartedAt: string,
): Promise<
  | { ok: true; row: BriefingAudioRow }
  | { ok: false; result: GenerateMorningBriefAudioResult }
> {
  const row = await loadBriefingAudioRow(supabase, userId, briefingDate);

  if (!row || row.content !== normalizedSpokenContent) {
    return {
      ok: false,
      result: {
        resultCode: MORNING_BRIEF_AUDIO_ERROR_CODES.briefingChanged,
        contentHash,
      },
    };
  }

  if (ownsGenerationClaim(row, normalizedSpokenContent, contentHash, claimStartedAt)) {
    return { ok: true, row };
  }

  return {
    ok: false,
    result: resolveLostOwnershipResult(row, contentHash),
  };
}

async function handleReadyPersistenceFailure(
  supabase: SupabaseClient,
  input: GenerateMorningBriefAudioInput,
  normalizedSpokenContent: string,
  contentHash: string,
  claimStartedAt: string,
  storagePath: string,
  ttsConfig: ReturnType<typeof resolveMorningBriefTtsConfig>,
): Promise<GenerateMorningBriefAudioResult> {
  const recoveryRow = await loadBriefingAudioRow(
    supabase,
    input.userId,
    input.briefingDate,
  );

  if (recoveryRow && isReadyWithMatchingHash(recoveryRow, contentHash)) {
    const result: GenerateMorningBriefAudioResult = {
      resultCode: "already_ready",
      contentHash,
      reused: true,
    };
    logMorningBriefAudioDiagnostic({
      stage: "persistence_recovery",
      resultCode: result.resultCode,
      model: ttsConfig.model,
      reused: true,
    });
    return result;
  }

  if (
    recoveryRow &&
    recoveryRow.audio_status === "generating" &&
    recoveryRow.audio_content_hash === contentHash &&
    !timestampsRepresentSameInstant(
      recoveryRow.audio_generation_started_at,
      claimStartedAt,
    )
  ) {
    const result: GenerateMorningBriefAudioResult = {
      resultCode: "generation_in_progress",
      contentHash,
    };
    logMorningBriefAudioDiagnostic({
      stage: "persistence_recovery",
      resultCode: result.resultCode,
      model: ttsConfig.model,
    });
    return result;
  }

  if (recoveryRow && recoveryRow.content !== normalizedSpokenContent) {
    await deleteMorningBriefAudioObjectBestEffort(
      supabase,
      storagePath,
      input.userId,
      input.briefingDate,
    );
    const result: GenerateMorningBriefAudioResult = {
      resultCode: MORNING_BRIEF_AUDIO_ERROR_CODES.briefingChanged,
      contentHash,
    };
    logMorningBriefAudioDiagnostic({
      stage: "persistence_recovery",
      resultCode: result.resultCode,
      model: ttsConfig.model,
    });
    return result;
  }

  if (
    recoveryRow &&
    ownsGenerationClaim(
      recoveryRow,
      normalizedSpokenContent,
      contentHash,
      claimStartedAt,
    )
  ) {
    await deleteMorningBriefAudioObjectBestEffort(
      supabase,
      storagePath,
      input.userId,
      input.briefingDate,
    );
    await persistAudioFailure(
      supabase,
      input.userId,
      input.briefingDate,
      normalizedSpokenContent,
      contentHash,
      claimStartedAt,
      MORNING_BRIEF_AUDIO_ERROR_CODES.persistenceFailed,
    );
    const result: GenerateMorningBriefAudioResult = {
      resultCode: MORNING_BRIEF_AUDIO_ERROR_CODES.persistenceFailed,
      contentHash,
    };
    logMorningBriefAudioDiagnostic({
      stage: "persistence",
      resultCode: result.resultCode,
      model: ttsConfig.model,
    });
    return result;
  }

  const result = resolveLostOwnershipResult(recoveryRow, contentHash);
  logMorningBriefAudioDiagnostic({
    stage: "persistence_recovery",
    resultCode: result.resultCode,
    model: ttsConfig.model,
    reused: result.reused,
  });
  return result;
}

export async function generateMorningBriefAudio(
  input: GenerateMorningBriefAudioInput,
  deps: GenerateMorningBriefAudioDeps = {},
): Promise<GenerateMorningBriefAudioResult> {
  const normalizedSpokenContent = input.normalizedSpokenContent.trim();

  if (!normalizedSpokenContent || !isValidBriefingDate(input.briefingDate)) {
    const result: GenerateMorningBriefAudioResult = {
      resultCode: MORNING_BRIEF_AUDIO_ERROR_CODES.invalidInput,
    };
    logMorningBriefAudioDiagnostic({
      stage: "validation",
      resultCode: result.resultCode,
    });
    return result;
  }

  const ttsConfig = resolveMorningBriefTtsConfig();
  const contentHash = computeTtsContentHash({
    text: normalizedSpokenContent,
    model: ttsConfig.model,
    voice: ttsConfig.voice,
    format: ttsConfig.format,
    instructionVersion: ttsConfig.instructionVersion,
  });

  let supabase: SupabaseClient;

  try {
    supabase = deps.automationClient ?? createAutomationClient();
  } catch {
    const result: GenerateMorningBriefAudioResult = {
      resultCode: MORNING_BRIEF_AUDIO_ERROR_CODES.persistenceFailed,
      contentHash,
    };
    logMorningBriefAudioDiagnostic({
      stage: "automation_client",
      resultCode: result.resultCode,
      model: ttsConfig.model,
    });
    return result;
  }

  const row = await loadBriefingAudioRow(
    supabase,
    input.userId,
    input.briefingDate,
  );

  if (!row) {
    const result: GenerateMorningBriefAudioResult = {
      resultCode: MORNING_BRIEF_AUDIO_ERROR_CODES.briefingNotFound,
      contentHash,
    };
    logMorningBriefAudioDiagnostic({
      stage: "briefing_lookup",
      resultCode: result.resultCode,
      model: ttsConfig.model,
    });
    return result;
  }

  if (row.content !== normalizedSpokenContent) {
    const result: GenerateMorningBriefAudioResult = {
      resultCode: MORNING_BRIEF_AUDIO_ERROR_CODES.briefingChanged,
      contentHash,
    };
    logMorningBriefAudioDiagnostic({
      stage: "content_match",
      resultCode: result.resultCode,
      model: ttsConfig.model,
    });
    return result;
  }

  if (isReadyWithMatchingHash(row, contentHash)) {
    const result: GenerateMorningBriefAudioResult = {
      resultCode: "already_ready",
      contentHash,
      reused: true,
    };
    logMorningBriefAudioDiagnostic({
      stage: "idempotency",
      resultCode: result.resultCode,
      model: ttsConfig.model,
      reused: true,
    });
    return result;
  }

  const now = (deps.now ?? (() => new Date()))();
  const claimStartedAt = now.toISOString();
  const staleBeforeIso = new Date(
    now.getTime() - MORNING_BRIEF_AUDIO_GENERATION_STALE_MS,
  ).toISOString();

  const claimResult = await claimAudioGeneration(
    supabase,
    input.userId,
    input.briefingDate,
    normalizedSpokenContent,
    contentHash,
    claimStartedAt,
    staleBeforeIso,
  );

  if (claimResult.status === "already_ready") {
    const result: GenerateMorningBriefAudioResult = {
      resultCode: "already_ready",
      contentHash,
      reused: true,
    };
    logMorningBriefAudioDiagnostic({
      stage: "claim",
      resultCode: result.resultCode,
      model: ttsConfig.model,
      reused: true,
    });
    return result;
  }

  if (claimResult.status === "generation_in_progress") {
    const result: GenerateMorningBriefAudioResult = {
      resultCode: "generation_in_progress",
      contentHash,
    };
    logMorningBriefAudioDiagnostic({
      stage: "claim",
      resultCode: result.resultCode,
      model: ttsConfig.model,
    });
    return result;
  }

  if (claimResult.status === "briefing_changed") {
    const result: GenerateMorningBriefAudioResult = {
      resultCode: MORNING_BRIEF_AUDIO_ERROR_CODES.briefingChanged,
      contentHash,
    };
    logMorningBriefAudioDiagnostic({
      stage: "claim",
      resultCode: result.resultCode,
      model: ttsConfig.model,
    });
    return result;
  }

  const authoritativeClaimStartedAt = claimResult.claimStartedAt;

  const previousStoragePath = row.audio_storage_path;
  const storagePath = buildMorningBriefAudioStoragePath(
    input.userId,
    input.briefingDate,
    contentHash,
  );

  const createSpeech = deps.createSpeech ?? createSpeechAudio;
  const speechResult = await createSpeech(normalizedSpokenContent, ttsConfig);

  if (!speechResult.success) {
    const persisted = await persistAudioFailure(
      supabase,
      input.userId,
      input.briefingDate,
      normalizedSpokenContent,
      contentHash,
      authoritativeClaimStartedAt,
      speechResult.errorCode,
    );
    const result: GenerateMorningBriefAudioResult = persisted
      ? {
          resultCode: speechResult.errorCode,
          contentHash,
        }
      : resolveLostOwnershipResult(
          await loadBriefingAudioRow(supabase, input.userId, input.briefingDate),
          contentHash,
        );
    logMorningBriefAudioDiagnostic({
      stage: "tts",
      resultCode: result.resultCode,
      model: ttsConfig.model,
    });
    return result;
  }

  if (speechResult.audioBytes.byteLength === 0) {
    const persisted = await persistAudioFailure(
      supabase,
      input.userId,
      input.briefingDate,
      normalizedSpokenContent,
      contentHash,
      authoritativeClaimStartedAt,
      MORNING_BRIEF_AUDIO_ERROR_CODES.emptyAudio,
    );
    const result: GenerateMorningBriefAudioResult = persisted
      ? {
          resultCode: MORNING_BRIEF_AUDIO_ERROR_CODES.emptyAudio,
          contentHash,
        }
      : resolveLostOwnershipResult(
          await loadBriefingAudioRow(supabase, input.userId, input.briefingDate),
          contentHash,
        );
    logMorningBriefAudioDiagnostic({
      stage: "tts",
      resultCode: result.resultCode,
      model: ttsConfig.model,
    });
    return result;
  }

  const preUploadOwnership = await verifyGenerationOwnership(
    supabase,
    input.userId,
    input.briefingDate,
    normalizedSpokenContent,
    contentHash,
    authoritativeClaimStartedAt,
  );

  if (!preUploadOwnership.ok) {
    logMorningBriefAudioDiagnostic({
      stage: "pre_upload_ownership",
      resultCode: preUploadOwnership.result.resultCode,
      model: ttsConfig.model,
      reused: preUploadOwnership.result.reused,
    });
    return preUploadOwnership.result;
  }

  const uploaded = await uploadMorningBriefAudio(
    supabase,
    storagePath,
    speechResult.audioBytes,
  );

  if (!uploaded) {
    const persisted = await persistAudioFailure(
      supabase,
      input.userId,
      input.briefingDate,
      normalizedSpokenContent,
      contentHash,
      authoritativeClaimStartedAt,
      MORNING_BRIEF_AUDIO_ERROR_CODES.storageUploadFailed,
    );
    const result: GenerateMorningBriefAudioResult = persisted
      ? {
          resultCode: MORNING_BRIEF_AUDIO_ERROR_CODES.storageUploadFailed,
          contentHash,
        }
      : resolveLostOwnershipResult(
          await loadBriefingAudioRow(supabase, input.userId, input.briefingDate),
          contentHash,
        );
    logMorningBriefAudioDiagnostic({
      stage: "storage_upload",
      resultCode: result.resultCode,
      model: ttsConfig.model,
    });
    return result;
  }

  const postUploadOwnership = await verifyGenerationOwnership(
    supabase,
    input.userId,
    input.briefingDate,
    normalizedSpokenContent,
    contentHash,
    authoritativeClaimStartedAt,
  );

  if (!postUploadOwnership.ok) {
    if (
      postUploadOwnership.result.resultCode ===
      MORNING_BRIEF_AUDIO_ERROR_CODES.briefingChanged
    ) {
      await deleteMorningBriefAudioObjectBestEffort(
        supabase,
        storagePath,
        input.userId,
        input.briefingDate,
      );
    }

    logMorningBriefAudioDiagnostic({
      stage: "post_upload_ownership",
      resultCode: postUploadOwnership.result.resultCode,
      model: ttsConfig.model,
      reused: postUploadOwnership.result.reused,
    });
    return postUploadOwnership.result;
  }

  const generatedAt = new Date().toISOString();

  const { data: persistedRow, error: persistError } = await supabase
    .from("morning_briefings")
    .update({
      audio_status: "ready",
      audio_content_hash: contentHash,
      audio_storage_path: storagePath,
      audio_generated_at: generatedAt,
      audio_error_code: null,
      audio_model: ttsConfig.model,
      audio_voice: ttsConfig.voice,
      audio_generation_started_at: null,
    })
    .eq("user_id", input.userId)
    .eq("briefing_date", input.briefingDate)
    .eq("content", normalizedSpokenContent)
    .eq("audio_status", "generating")
    .eq("audio_content_hash", contentHash)
    .eq("audio_generation_started_at", authoritativeClaimStartedAt)
    .select("audio_storage_path")
    .maybeSingle();

  if (persistError || !persistedRow) {
    return handleReadyPersistenceFailure(
      supabase,
      input,
      normalizedSpokenContent,
      contentHash,
      authoritativeClaimStartedAt,
      storagePath,
      ttsConfig,
    );
  }

  if (
    previousStoragePath &&
    previousStoragePath !== storagePath &&
    isMorningBriefAudioStoragePath(
      previousStoragePath,
      input.userId,
      input.briefingDate,
    )
  ) {
    await deleteMorningBriefAudioObjectBestEffort(
      supabase,
      previousStoragePath,
      input.userId,
      input.briefingDate,
      storagePath,
    );
  }

  const result: GenerateMorningBriefAudioResult = {
    resultCode: "ready",
    contentHash,
    reused: false,
  };
  logMorningBriefAudioDiagnostic({
    stage: "complete",
    resultCode: result.resultCode,
    model: ttsConfig.model,
    reused: false,
  });
  return result;
}
