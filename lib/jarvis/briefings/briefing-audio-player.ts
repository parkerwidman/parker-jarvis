import type { MorningBriefAudioStatus } from "@/lib/jarvis/dashboard/load-command-center";

import { BRIEFING_WAVEFORM_BAR_COUNT } from "@/lib/jarvis/briefings/briefing-waveform";

export const MORNING_BRIEF_AUDIO_SIGNED_URL_TTL_SECONDS = 90;

export const SIGNED_URL_REFRESH_BUFFER_SECONDS = 5;

export type BriefingAudioRetryStatus = "ready" | "generating" | "failed";

export type BriefingAudioFetchResult =
  | { ok: true; url: string; expiresInSeconds: number }
  | { ok: false; reason: "unauthorized" | "not_found" | "unavailable" | "not_ready" };

export type BriefingAudioPlaybackPhase =
  | "idle"
  | "loading_url"
  | "ready"
  | "playing"
  | "paused"
  | "ended"
  | "playback_error";

export function formatAudioTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function computePlaybackProgress(
  currentTime: number,
  duration: number | null,
): number {
  if (duration == null || !Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  if (!Number.isFinite(currentTime) || currentTime <= 0) {
    return 0;
  }

  return Math.min(1, currentTime / duration);
}

export function computePlayedBarCount(
  progress: number,
  barCount = BRIEFING_WAVEFORM_BAR_COUNT,
): number {
  if (!Number.isFinite(progress) || progress <= 0) {
    return 0;
  }

  return Math.min(barCount, Math.floor(progress * barCount));
}

export function resolveSignedUrlTtlSeconds(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  return MORNING_BRIEF_AUDIO_SIGNED_URL_TTL_SECONDS;
}

export function isSignedUrlStale(
  obtainedAtMs: number | null,
  nowMs: number,
  ttlSeconds = MORNING_BRIEF_AUDIO_SIGNED_URL_TTL_SECONDS,
  bufferSeconds = SIGNED_URL_REFRESH_BUFFER_SECONDS,
): boolean {
  if (obtainedAtMs === null) {
    return true;
  }

  const ageMs = nowMs - obtainedAtMs;
  const effectiveTtlMs = Math.max(0, ttlSeconds - bufferSeconds) * 1000;

  return ageMs >= effectiveTtlMs;
}

export function shouldFetchSignedUrl(options: {
  signedUrl: string | null;
  obtainedAtMs: number | null;
  expiresInSeconds?: number | null;
  nowMs: number;
  fetchInFlight: boolean;
  forceRefresh?: boolean;
}): boolean {
  if (options.fetchInFlight) {
    return false;
  }

  if (options.forceRefresh) {
    return true;
  }

  const ttlSeconds = resolveSignedUrlTtlSeconds(options.expiresInSeconds);

  if (
    !options.signedUrl ||
    isSignedUrlStale(options.obtainedAtMs, options.nowMs, ttlSeconds)
  ) {
    return true;
  }

  return false;
}

export function canAttemptSignedUrlRefresh(options: {
  urlRefreshUsed: boolean;
  fetchInFlight: boolean;
}): boolean {
  return !options.urlRefreshUsed && !options.fetchInFlight;
}

export function mapGenerationResultToRetryStatus(
  resultCode: string,
): BriefingAudioRetryStatus {
  if (resultCode === "already_ready" || resultCode === "ready") {
    return "ready";
  }

  if (resultCode === "generation_in_progress") {
    return "generating";
  }

  return "failed";
}

export function mapAudioFetchPayload(payload: {
  status?: string;
  url?: string;
  expiresInSeconds?: number;
  error?: string;
}): BriefingAudioFetchResult {
  if (payload.status === "ready" && typeof payload.url === "string") {
    return {
      ok: true,
      url: payload.url,
      expiresInSeconds: resolveSignedUrlTtlSeconds(payload.expiresInSeconds),
    };
  }

  if (payload.error === "unauthorized") {
    return { ok: false, reason: "unauthorized" };
  }

  if (payload.error === "not_found") {
    return { ok: false, reason: "not_found" };
  }

  if (payload.status === "generating" || payload.status === "failed") {
    return { ok: false, reason: "not_ready" };
  }

  return { ok: false, reason: "unavailable" };
}

export function mapRetryPayload(payload: {
  status?: string;
  error?: string;
}): BriefingAudioRetryStatus | "unauthorized" | "not_found" | "invalid_request" | "unavailable" {
  if (payload.error === "unauthorized") {
    return "unauthorized";
  }

  if (payload.error === "not_found") {
    return "not_found";
  }

  if (payload.error === "invalid_request") {
    return "invalid_request";
  }

  if (
    payload.status === "ready" ||
    payload.status === "generating" ||
    payload.status === "failed"
  ) {
    return payload.status;
  }

  return "unavailable";
}

export function getPlayButtonAriaLabel(options: {
  phase: BriefingAudioPlaybackPhase;
  loadingUrl: boolean;
}): string {
  if (options.loadingUrl || options.phase === "loading_url") {
    return "Loading audio";
  }

  if (options.phase === "playing") {
    return "Pause morning briefing";
  }

  if (options.phase === "ended") {
    return "Replay morning briefing";
  }

  return "Play morning briefing";
}

export function getAudioStatusMessage(
  audioStatus: MorningBriefAudioStatus,
  options?: {
    isRetrying?: boolean;
    playbackError?: string | null;
  },
): string {
  if (options?.isRetrying) {
    return "Generating audio…";
  }

  if (options?.playbackError) {
    return options.playbackError;
  }

  switch (audioStatus) {
    case "none":
      return "Audio not generated yet";
    case "pending":
    case "generating":
      return "Generating audio…";
    case "failed":
      return "Audio unavailable";
    case "ready":
      return "";
    default:
      return "Audio unavailable";
  }
}

export function shouldShowRetryAction(
  audioStatus: MorningBriefAudioStatus,
): boolean {
  return (
    audioStatus === "none" ||
    audioStatus === "failed" ||
    audioStatus === "generating" ||
    audioStatus === "pending"
  );
}

export function getRetryButtonLabel(
  audioStatus: MorningBriefAudioStatus,
): string {
  if (audioStatus === "none") {
    return "Generate audio";
  }

  return "Retry audio";
}

export function isPlayControlEnabled(
  audioStatus: MorningBriefAudioStatus,
  options?: {
    isRetrying?: boolean;
    loadingUrl?: boolean;
  },
): boolean {
  if (options?.isRetrying) {
    return false;
  }

  return audioStatus === "ready" && !options?.loadingUrl;
}

export function buildAudioFetchUrl(briefingDate: string): string {
  const params = new URLSearchParams({ briefingDate });
  return `/api/briefings/audio?${params.toString()}`;
}

export function buildAudioRetryRequestBody(briefingDate: string): string {
  return JSON.stringify({ briefingDate });
}

export function derivePlaybackPhase(options: {
  isPlaying: boolean;
  ended: boolean;
  loadingUrl: boolean;
  hasSignedUrl: boolean;
}): BriefingAudioPlaybackPhase {
  if (options.loadingUrl) {
    return "loading_url";
  }

  if (options.ended) {
    return "ended";
  }

  if (options.isPlaying) {
    return "playing";
  }

  if (options.hasSignedUrl) {
    return "paused";
  }

  return "idle";
}

export type BriefingPlaybackIdentity = {
  briefingDate: string | null;
  audioStatus: MorningBriefAudioStatus;
  audioGeneratedAt: string | null;
};

export function shouldResetPlaybackState(
  previous: BriefingPlaybackIdentity,
  next: BriefingPlaybackIdentity,
): boolean {
  return (
    previous.briefingDate !== next.briefingDate ||
    previous.audioStatus !== next.audioStatus ||
    previous.audioGeneratedAt !== next.audioGeneratedAt
  );
}
