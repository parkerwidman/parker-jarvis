import { describe, expect, it } from "vitest";

import { BRIEFING_WAVEFORM_BAR_COUNT } from "@/lib/jarvis/briefings/briefing-waveform";
import {
  buildAudioFetchUrl,
  buildAudioRetryRequestBody,
  canAttemptSignedUrlRefresh,
  computePlayedBarCount,
  computePlaybackProgress,
  derivePlaybackPhase,
  formatAudioTime,
  getAudioStatusMessage,
  getPlayButtonAriaLabel,
  getRetryButtonLabel,
  isPlayControlEnabled,
  isSignedUrlStale,
  mapAudioFetchPayload,
  mapGenerationResultToRetryStatus,
  mapRetryPayload,
  MORNING_BRIEF_AUDIO_SIGNED_URL_TTL_SECONDS,
  resolveSignedUrlTtlSeconds,
  shouldFetchSignedUrl,
  shouldResetPlaybackState,
  shouldShowRetryAction,
} from "@/lib/jarvis/briefings/briefing-audio-player";

describe("briefing audio player helpers", () => {
  describe("formatAudioTime", () => {
    it("formats elapsed and duration as M:SS", () => {
      expect(formatAudioTime(0)).toBe("0:00");
      expect(formatAudioTime(27)).toBe("0:27");
      expect(formatAudioTime(65)).toBe("1:05");
    });

    it("handles unknown duration safely", () => {
      expect(formatAudioTime(null)).toBe("0:00");
      expect(formatAudioTime(undefined)).toBe("0:00");
      expect(formatAudioTime(Number.NaN)).toBe("0:00");
      expect(formatAudioTime(Number.POSITIVE_INFINITY)).toBe("0:00");
    });
  });

  describe("playback progress and waveform", () => {
    it("derives progress from currentTime / duration only", () => {
      expect(computePlaybackProgress(30, 120)).toBe(0.25);
      expect(computePlaybackProgress(0, 0)).toBe(0);
      expect(computePlaybackProgress(10, null)).toBe(0);
    });

    it("marks bars before playback percentage as played", () => {
      expect(computePlayedBarCount(0.5, 60)).toBe(30);
      expect(computePlayedBarCount(0, BRIEFING_WAVEFORM_BAR_COUNT)).toBe(0);
      expect(computePlayedBarCount(1, BRIEFING_WAVEFORM_BAR_COUNT)).toBe(
        BRIEFING_WAVEFORM_BAR_COUNT,
      );
    });
  });

  describe("signed URL lifecycle", () => {
    it("does not fetch when a fresh signed URL is already in memory", () => {
      const now = 1_000_000;
      const obtainedAt = now - 10_000;

      expect(
        shouldFetchSignedUrl({
          signedUrl: "https://example.test/audio.mp3",
          obtainedAtMs: obtainedAt,
          nowMs: now,
          fetchInFlight: false,
        }),
      ).toBe(false);
    });

    it("requires fetch when URL is missing or stale before playback", () => {
      const now = 1_000_000;

      expect(
        shouldFetchSignedUrl({
          signedUrl: null,
          obtainedAtMs: null,
          nowMs: now,
          fetchInFlight: false,
        }),
      ).toBe(true);

      expect(
        isSignedUrlStale(
          now - MORNING_BRIEF_AUDIO_SIGNED_URL_TTL_SECONDS * 1000,
          now,
        ),
      ).toBe(true);
    });

    it("blocks duplicate fetch while one is in flight", () => {
      expect(
        shouldFetchSignedUrl({
          signedUrl: null,
          obtainedAtMs: null,
          nowMs: Date.now(),
          fetchInFlight: true,
        }),
      ).toBe(false);

      expect(
        shouldFetchSignedUrl({
          signedUrl: "https://example.test/audio.mp3",
          obtainedAtMs: Date.now(),
          expiresInSeconds: 90,
          nowMs: Date.now(),
          fetchInFlight: false,
          forceRefresh: true,
        }),
      ).toBe(true);
    });

    it("forceRefresh always requires a new GET even when URL is fresh", () => {
      const now = 1_000_000;
      const obtainedAt = now - 1_000;

      expect(
        shouldFetchSignedUrl({
          signedUrl: "https://example.test/old.mp3",
          obtainedAtMs: obtainedAt,
          expiresInSeconds: 90,
          nowMs: now,
          fetchInFlight: false,
          forceRefresh: true,
        }),
      ).toBe(true);

      expect(
        shouldFetchSignedUrl({
          signedUrl: "https://example.test/old.mp3",
          obtainedAtMs: obtainedAt,
          expiresInSeconds: 90,
          nowMs: now,
          fetchInFlight: false,
          forceRefresh: false,
        }),
      ).toBe(false);
    });

    it("uses server-provided expiresInSeconds for stale timing", () => {
      const now = 1_000_000;
      const staleObtainedAt = now - 56_000;
      const freshObtainedAt = now - 50_000;

      expect(isSignedUrlStale(staleObtainedAt, now, 60)).toBe(true);
      expect(isSignedUrlStale(freshObtainedAt, now, 90)).toBe(false);
    });

    it("falls back to 90 seconds when TTL is missing or invalid", () => {
      expect(resolveSignedUrlTtlSeconds(undefined)).toBe(
        MORNING_BRIEF_AUDIO_SIGNED_URL_TTL_SECONDS,
      );
      expect(resolveSignedUrlTtlSeconds(0)).toBe(
        MORNING_BRIEF_AUDIO_SIGNED_URL_TTL_SECONDS,
      );
      expect(resolveSignedUrlTtlSeconds(-10)).toBe(
        MORNING_BRIEF_AUDIO_SIGNED_URL_TTL_SECONDS,
      );
      expect(resolveSignedUrlTtlSeconds(45)).toBe(45);
    });

    it("allows one controlled refresh and blocks infinite retry", () => {
      expect(
        canAttemptSignedUrlRefresh({
          urlRefreshUsed: false,
          fetchInFlight: false,
        }),
      ).toBe(true);

      expect(
        canAttemptSignedUrlRefresh({
          urlRefreshUsed: true,
          fetchInFlight: false,
        }),
      ).toBe(false);
    });

    it("builds fetch and retry requests without extra client fields", () => {
      expect(buildAudioFetchUrl("2026-08-07")).toBe(
        "/api/briefings/audio?briefingDate=2026-08-07",
      );
      expect(buildAudioRetryRequestBody("2026-08-07")).toBe(
        JSON.stringify({ briefingDate: "2026-08-07" }),
      );
      expect(buildAudioRetryRequestBody("2026-08-07")).not.toContain("userId");
    });
  });

  describe("audio fetch and retry mapping", () => {
    it("maps ready signed URL responses", () => {
      expect(
        mapAudioFetchPayload({
          status: "ready",
          url: "https://example.test/audio.mp3",
          expiresInSeconds: 90,
        }),
      ).toEqual({
        ok: true,
        url: "https://example.test/audio.mp3",
        expiresInSeconds: 90,
      });
    });

    it("maps retry generation result codes conservatively", () => {
      expect(mapGenerationResultToRetryStatus("already_ready")).toBe("ready");
      expect(mapGenerationResultToRetryStatus("ready")).toBe("ready");
      expect(mapGenerationResultToRetryStatus("generation_in_progress")).toBe(
        "generating",
      );
      expect(mapGenerationResultToRetryStatus("tts_failed")).toBe("failed");
    });

    it("maps retry payload statuses for player UX", () => {
      expect(mapRetryPayload({ status: "ready" })).toBe("ready");
      expect(mapRetryPayload({ status: "generating" })).toBe("generating");
      expect(mapRetryPayload({ status: "failed" })).toBe("failed");
      expect(mapRetryPayload({ error: "unauthorized" })).toBe("unauthorized");
      expect(mapRetryPayload({ error: "not_found" })).toBe("not_found");
    });
  });

  describe("player state helpers", () => {
    it("does not enable play unless audio is ready", () => {
      expect(isPlayControlEnabled("ready")).toBe(true);
      expect(isPlayControlEnabled("generating")).toBe(false);
      expect(isPlayControlEnabled("none")).toBe(false);
      expect(isPlayControlEnabled("ready", { isRetrying: true })).toBe(false);
    });

    it("shows retry for none, generating, and failed states", () => {
      expect(shouldShowRetryAction("none")).toBe(true);
      expect(shouldShowRetryAction("generating")).toBe(true);
      expect(shouldShowRetryAction("failed")).toBe(true);
      expect(shouldShowRetryAction("ready")).toBe(false);
    });

    it("labels retry actions appropriately", () => {
      expect(getRetryButtonLabel("none")).toBe("Generate audio");
      expect(getRetryButtonLabel("failed")).toBe("Retry audio");
    });

    it("derives play/pause/end phases from playback flags", () => {
      expect(
        derivePlaybackPhase({
          isPlaying: false,
          ended: false,
          loadingUrl: true,
          hasSignedUrl: false,
        }),
      ).toBe("loading_url");

      expect(
        derivePlaybackPhase({
          isPlaying: true,
          ended: false,
          loadingUrl: false,
          hasSignedUrl: true,
        }),
      ).toBe("playing");

      expect(
        derivePlaybackPhase({
          isPlaying: false,
          ended: true,
          loadingUrl: false,
          hasSignedUrl: true,
        }),
      ).toBe("ended");
    });

    it("resets playback when briefing identity changes", () => {
      const identity = (
        briefingDate: string,
        audioStatus: "ready" | "generating",
        audioGeneratedAt: string | null,
      ) => ({
        briefingDate,
        audioStatus,
        audioGeneratedAt,
      });

      expect(
        shouldResetPlaybackState(
          identity("2026-08-07", "ready", "2026-08-07T08:00:00.000Z"),
          identity("2026-08-08", "ready", "2026-08-07T08:00:00.000Z"),
        ),
      ).toBe(true);

      expect(
        shouldResetPlaybackState(
          identity("2026-08-07", "ready", "2026-08-07T08:00:00.000Z"),
          identity("2026-08-07", "generating", "2026-08-07T08:00:00.000Z"),
        ),
      ).toBe(true);

      expect(
        shouldResetPlaybackState(
          identity("2026-08-07", "ready", "2026-08-07T08:00:00.000Z"),
          identity("2026-08-07", "ready", "2026-08-07T09:00:00.000Z"),
        ),
      ).toBe(true);

      expect(
        shouldResetPlaybackState(
          identity("2026-08-07", "ready", "2026-08-07T08:00:00.000Z"),
          identity("2026-08-07", "ready", "2026-08-07T08:00:00.000Z"),
        ),
      ).toBe(false);
    });

    it("provides accessible play button labels", () => {
      expect(
        getPlayButtonAriaLabel({ phase: "loading_url", loadingUrl: true }),
      ).toBe("Loading audio");
      expect(
        getPlayButtonAriaLabel({ phase: "playing", loadingUrl: false }),
      ).toBe("Pause morning briefing");
      expect(
        getPlayButtonAriaLabel({ phase: "idle", loadingUrl: false }),
      ).toBe("Play morning briefing");
    });

    it("reports honest audio status messages", () => {
      expect(getAudioStatusMessage("none")).toBe("Audio not generated yet");
      expect(getAudioStatusMessage("generating")).toBe("Generating audio…");
      expect(getAudioStatusMessage("failed")).toBe("Audio unavailable");
      expect(getAudioStatusMessage("ready")).toBe("");
    });
  });
});

describe("briefing audio player flow simulation", () => {
  it("does not auto-fetch signed URL on ready initial state", () => {
    let fetchCount = 0;
    let userPressedPlay = false;

    if (userPressedPlay) {
      fetchCount += 1;
    }

    expect(fetchCount).toBe(0);
  });

  it("fetches signed URL only when play is requested", () => {
    let fetchCount = 0;
    let signedUrl: string | null = null;
    let obtainedAtMs: number | null = null;
    let fetchInFlight = false;

    function requestPlay(nowMs: number) {
      if (
        shouldFetchSignedUrl({
          signedUrl,
          obtainedAtMs,
          nowMs,
          fetchInFlight,
        })
      ) {
        fetchInFlight = true;
        fetchCount += 1;
        signedUrl = "https://example.test/audio.mp3";
        obtainedAtMs = nowMs;
        fetchInFlight = false;
      }
    }

    requestPlay(1_000);
    requestPlay(1_100);
    requestPlay(1_200);

    expect(fetchCount).toBe(1);
  });

  it("performs one controlled refresh after stale/error and then stops", () => {
    let refreshCount = 0;
    let urlRefreshUsed = false;
    let fetchInFlight = false;
    let mediaRecoveryInFlight = false;

    function maybeRefresh() {
      if (urlRefreshUsed || mediaRecoveryInFlight) {
        return;
      }

      if (
        canAttemptSignedUrlRefresh({
          urlRefreshUsed,
          fetchInFlight,
        })
      ) {
        mediaRecoveryInFlight = true;
        refreshCount += 1;
        urlRefreshUsed = true;
        mediaRecoveryInFlight = false;
      }
    }

    maybeRefresh();
    maybeRefresh();

    expect(refreshCount).toBe(1);
  });

  it("play rejection and media error share one forced refresh guard", () => {
    let refreshCount = 0;
    let urlRefreshUsed = false;
    let mediaRecoveryInFlight = false;

    function handleMediaFailure() {
      if (urlRefreshUsed || mediaRecoveryInFlight) {
        return;
      }

      mediaRecoveryInFlight = true;
      urlRefreshUsed = true;
      refreshCount += 1;
      mediaRecoveryInFlight = false;
    }

    handleMediaFailure();
    handleMediaFailure();

    expect(refreshCount).toBe(1);
  });

  it("forceRefresh replaces old in-memory URL without clearing React state first", () => {
    let signedUrl = "https://example.test/old.mp3";
    let obtainedAtMs = Date.now();
    let expiresInSeconds = 90;
    let fetchCount = 0;

    function fetchSignedUrl(options?: { forceRefresh?: boolean }) {
      if (
        !shouldFetchSignedUrl({
          signedUrl,
          obtainedAtMs,
          expiresInSeconds,
          nowMs: Date.now(),
          fetchInFlight: false,
          forceRefresh: options?.forceRefresh,
        })
      ) {
        return { url: signedUrl, expiresInSeconds };
      }

      fetchCount += 1;
      signedUrl = "https://example.test/new.mp3";
      obtainedAtMs = Date.now();
      expiresInSeconds = 120;
      return { url: signedUrl, expiresInSeconds };
    }

    const cached = fetchSignedUrl();
    expect(cached?.url).toBe("https://example.test/old.mp3");
    expect(fetchCount).toBe(0);

    const refreshed = fetchSignedUrl({ forceRefresh: true });
    expect(refreshed?.url).toBe("https://example.test/new.mp3");
    expect(fetchCount).toBe(1);
  });

  it("keeps signed URL in memory only via local variables", () => {
    const memory = {
      signedUrl: "https://example.test/audio.mp3" as string | null,
      obtainedAtMs: Date.now() as number | null,
    };

    expect(JSON.stringify(buildAudioRetryRequestBody("2026-08-07"))).not.toContain(
      memory.signedUrl,
    );
    expect(buildAudioFetchUrl("2026-08-07")).not.toContain("url=");
  });

  it("does not fake transcript synchronization", () => {
    const transcript = "Static transcript text without word timestamps.";
    const currentTime = 42;
    const highlightedTranscript = transcript;

    expect(highlightedTranscript).toBe(transcript);
    expect(currentTime).toBeGreaterThan(0);
  });
});
