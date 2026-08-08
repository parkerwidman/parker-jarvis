import { describe, expect, it } from "vitest";

import type { MorningRitualBriefingTimeline } from "@/lib/jarvis/rituals/morning-ritual-briefing";
import {
  canStartMorningRitual,
  computeSignedUrlRefreshDelayMs,
  createInitialStartAcknowledged,
  deriveRitualPlaybackSnapshot,
  extractTranscriptSentences,
  isAutoplayNotAllowedError,
  isMorningRitualStartAcknowledgedResult,
  parseMorningRitualCompleteResponse,
  parseMorningRitualStartResponse,
  resolveActiveSentenceIndex,
  resolveModeRevealed,
  resolvePlaybackReadinessMessage,
  resolveRecommendationStartMs,
  shouldApplySignedUrlToAudio,
  shouldPreloadMorningRitualAudio,
  shouldRequestCompletion,
  shouldRetryPlaybackWithStartPost,
  shouldRevealEnterJarvis,
} from "@/lib/jarvis/morning-ritual/morning-ritual-playback";

const TIMELINE: MorningRitualBriefingTimeline = {
  durationMs: 25320,
  sentences: [
    { index: 0, text: "Sentence zero.", startMs: 0, endMs: 4800 },
    { index: 1, text: "Sentence one.", startMs: 5000, endMs: 9800 },
    { index: 2, text: "Sentence two.", startMs: 10000, endMs: 14800 },
    { index: 3, text: "Sentence three.", startMs: 15000, endMs: 19800 },
    { index: 4, text: "Sentence four.", startMs: 20000, endMs: 24800 },
  ],
};

describe("morning ritual playback helpers", () => {
  it("extracts transcript sentences from timeline only", () => {
    expect(extractTranscriptSentences(TIMELINE)).toEqual([
      "Sentence zero.",
      "Sentence one.",
      "Sentence two.",
      "Sentence three.",
      "Sentence four.",
    ]);
  });

  it("returns no active sentence before the first startMs boundary", () => {
    expect(resolveActiveSentenceIndex(-1, TIMELINE.sentences)).toBe(-1);
    expect(resolveActiveSentenceIndex(0, TIMELINE.sentences)).toBe(0);
    expect(resolveActiveSentenceIndex(4999, TIMELINE.sentences)).toBe(0);
    expect(resolveActiveSentenceIndex(5000, TIMELINE.sentences)).toBe(1);
    expect(resolveActiveSentenceIndex(15000, TIMELINE.sentences)).toBe(3);
    expect(resolveActiveSentenceIndex(25320, TIMELINE.sentences)).toBe(4);
  });

  it("reveals recommendation accent at exact recommendation startMs", () => {
    expect(
      resolveModeRevealed(19999, "personal", 4, TIMELINE),
    ).toBe(false);
    expect(
      resolveModeRevealed(20000, "personal", 4, TIMELINE),
    ).toBe(true);
    expect(
      resolveModeRevealed(20000, "melusi", 4, TIMELINE),
    ).toBe(true);
  });

  it("keeps neutral accent when recommendation is null or index invalid", () => {
    expect(resolveModeRevealed(25000, null, 4, TIMELINE)).toBe(false);
    expect(resolveModeRevealed(25000, "personal", null, TIMELINE)).toBe(false);
    expect(resolveModeRevealed(25000, "personal", 99, TIMELINE)).toBe(false);
    expect(resolveRecommendationStartMs(TIMELINE, 99)).toBeNull();
  });

  it("derives playback snapshot from audio currentTimeMs", () => {
    const snapshot = deriveRitualPlaybackSnapshot({
      currentTimeMs: 15000,
      timeline: TIMELINE,
      recommendedMode: "personal",
      recommendationSentenceIndex: 4,
      isPlaying: true,
      audioEnded: false,
    });

    expect(snapshot.activeSentenceIndex).toBe(3);
    expect(snapshot.modeRevealed).toBe(false);
    expect(snapshot.isPlaying).toBe(true);
    expect(snapshot.audioEnded).toBe(false);
  });

  it("marks audio ended and stops playing state", () => {
    const snapshot = deriveRitualPlaybackSnapshot({
      currentTimeMs: 25320,
      timeline: TIMELINE,
      recommendedMode: "personal",
      recommendationSentenceIndex: 4,
      isPlaying: false,
      audioEnded: true,
    });

    expect(snapshot.isPlaying).toBe(false);
    expect(snapshot.audioEnded).toBe(true);
    expect(snapshot.modeRevealed).toBe(true);
  });

  it("preloads audio only for ready full_required briefings", () => {
    expect(
      shouldPreloadMorningRitualAudio({
        ritualState: "full_required",
        playbackReadiness: "ready",
        briefing: {
          briefingDate: "2026-08-07",
          transcript: "x",
          audioStatus: "ready",
          audioGeneratedAt: "2026-08-07T12:00:00.000Z",
          timeline: TIMELINE,
          recommendedMode: null,
          recommendationSentenceIndex: null,
        },
      }),
    ).toBe(true);

    expect(
      shouldPreloadMorningRitualAudio({
        ritualState: "welcome_back",
        playbackReadiness: "ready",
        briefing: null,
      }),
    ).toBe(false);

    expect(
      shouldPreloadMorningRitualAudio({
        ritualState: "full_required",
        playbackReadiness: "no_brief",
        briefing: null,
      }),
    ).toBe(false);
  });

  it("blocks sign in until briefing, readiness, and audio are prepared", () => {
    const briefing = {
      briefingDate: "2026-08-07",
      transcript: "x",
      audioStatus: "ready" as const,
      audioGeneratedAt: "2026-08-07T12:00:00.000Z",
      timeline: TIMELINE,
      recommendedMode: null,
      recommendationSentenceIndex: null,
    };

    expect(
      canStartMorningRitual({
        playbackReadiness: "ready",
        briefing,
        audioPrepared: true,
        startInFlight: false,
      }),
    ).toBe(true);

    expect(
      canStartMorningRitual({
        playbackReadiness: "timeline_missing",
        briefing,
        audioPrepared: true,
        startInFlight: false,
      }),
    ).toBe(false);

    expect(
      canStartMorningRitual({
        playbackReadiness: "ready",
        briefing,
        audioPrepared: false,
        startInFlight: false,
      }),
    ).toBe(false);

    expect(
      canStartMorningRitual({
        playbackReadiness: "ready",
        briefing,
        audioPrepared: true,
        startInFlight: true,
      }),
    ).toBe(false);
  });

  it("maps readiness failures to concise messages", () => {
    expect(resolvePlaybackReadinessMessage("no_brief")).toBe(
      "Morning Brief isn't ready yet",
    );
    expect(resolvePlaybackReadinessMessage("audio_not_ready")).toBe(
      "Morning Brief audio is still preparing",
    );
    expect(resolvePlaybackReadinessMessage("timeline_missing")).toBe(
      "Morning Brief is still preparing",
    );
    expect(resolvePlaybackReadinessMessage("ready")).toBeNull();
  });

  it("parses start and complete responses", () => {
    expect(parseMorningRitualStartResponse({ result: "started" })).toEqual({
      ok: true,
      result: "started",
    });
    expect(parseMorningRitualStartResponse({ result: "already_started" })).toEqual({
      ok: true,
      result: "already_started",
    });
    expect(parseMorningRitualStartResponse({ error: "briefing_not_ready" })).toEqual({
      ok: false,
      reason: "briefing_not_ready",
    });

    expect(parseMorningRitualCompleteResponse({ result: "completed" })).toEqual({
      ok: true,
      result: "completed",
    });
    expect(parseMorningRitualCompleteResponse({ error: "unavailable" })).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("reveals Enter Jarvis only after completion is acknowledged and audio ended", () => {
    expect(
      shouldRevealEnterJarvis({
        completionAcknowledged: true,
        audioEnded: true,
      }),
    ).toBe(true);

    expect(
      shouldRevealEnterJarvis({
        completionAcknowledged: false,
        audioEnded: true,
      }),
    ).toBe(false);

    expect(
      shouldRevealEnterJarvis({
        completionAcknowledged: true,
        audioEnded: false,
      }),
    ).toBe(false);
  });

  it("computes conservative signed URL refresh delay", () => {
    expect(computeSignedUrlRefreshDelayMs(90, 5)).toBe(85_000);
    expect(computeSignedUrlRefreshDelayMs(1, 5)).toBe(1_000);
  });

  it("detects autoplay NotAllowedError", () => {
    expect(
      isAutoplayNotAllowedError(new DOMException("play failed", "NotAllowedError")),
    ).toBe(true);
    expect(isAutoplayNotAllowedError(new Error("nope"))).toBe(false);
  });

  it("tracks durable start acknowledgement from server results", () => {
    expect(createInitialStartAcknowledged("started")).toBe(true);
    expect(createInitialStartAcknowledged("not_started")).toBe(false);
    expect(createInitialStartAcknowledged("completed")).toBe(false);
    expect(isMorningRitualStartAcknowledgedResult("started")).toBe(true);
    expect(isMorningRitualStartAcknowledgedResult("already_started")).toBe(true);
    expect(isMorningRitualStartAcknowledgedResult("already_completed")).toBe(false);
  });

  it("requires start acknowledgement before completion can proceed", () => {
    expect(
      shouldRequestCompletion({
        audioEnded: true,
        startAcknowledged: false,
      }),
    ).toBe(false);
    expect(
      shouldRequestCompletion({
        audioEnded: true,
        startAcknowledged: true,
      }),
    ).toBe(true);
    expect(
      shouldRequestCompletion({
        audioEnded: false,
        startAcknowledged: true,
      }),
    ).toBe(false);
  });

  it("skips start POST on autoplay retry after durable start acknowledgement", () => {
    expect(shouldRetryPlaybackWithStartPost(true)).toBe(false);
    expect(shouldRetryPlaybackWithStartPost(false)).toBe(true);
  });

  it("blocks signed URL application during active playback sessions", () => {
    expect(
      shouldApplySignedUrlToAudio({
        playbackSessionLocked: true,
        fetchGeneration: 2,
        fetchGenerationAtStart: 2,
        unmounted: false,
      }),
    ).toBe(false);

    expect(
      shouldApplySignedUrlToAudio({
        playbackSessionLocked: false,
        fetchGeneration: 3,
        fetchGenerationAtStart: 2,
        unmounted: false,
      }),
    ).toBe(false);

    expect(
      shouldApplySignedUrlToAudio({
        playbackSessionLocked: false,
        fetchGeneration: 2,
        fetchGenerationAtStart: 2,
        unmounted: false,
      }),
    ).toBe(true);
  });

  it("ignores stale signed URL refresh results after unmount", () => {
    expect(
      shouldApplySignedUrlToAudio({
        playbackSessionLocked: false,
        fetchGeneration: 2,
        fetchGenerationAtStart: 2,
        unmounted: true,
      }),
    ).toBe(false);
  });

  it("derives no active sentence before first startMs in playback snapshot", () => {
    const snapshot = deriveRitualPlaybackSnapshot({
      currentTimeMs: -1,
      timeline: TIMELINE,
      recommendedMode: "personal",
      recommendationSentenceIndex: 4,
      isPlaying: true,
      audioEnded: false,
    });

    expect(snapshot.activeSentenceIndex).toBe(-1);
    expect(snapshot.modeRevealed).toBe(false);
  });
});
