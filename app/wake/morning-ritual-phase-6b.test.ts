import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  canStartMorningRitual,
  deriveRitualPlaybackSnapshot,
  extractTranscriptSentences,
  parseMorningRitualCompleteResponse,
  parseMorningRitualStartResponse,
  resolveActiveSentenceIndex,
  resolveModeRevealed,
  shouldPreloadMorningRitualAudio,
  shouldRevealEnterJarvis,
} from "@/lib/jarvis/morning-ritual/morning-ritual-playback";
import {
  completeMorningRitualRequest,
  fetchMorningRitualSignedAudioUrl,
  startMorningRitualRequest,
} from "@/lib/jarvis/morning-ritual/morning-ritual-api";
import { getDemoRitualSnapshot } from "@/lib/jarvis/morning-ritual/demo-ritual-timeline";
import { getRingColor } from "@/lib/jarvis/morning-ritual/ring-geometry";
import type { MorningRitualBriefingTimeline } from "@/lib/jarvis/rituals/morning-ritual-briefing";

const ROOT = resolve(import.meta.dirname, "../..");
const FLOW_PATH = resolve(
  ROOT,
  "components/jarvis/morning-ritual/morning-ritual-flow.tsx",
);
const GATE_PATH = resolve(
  ROOT,
  "components/jarvis/morning-ritual/morning-ritual-gate.tsx",
);
const FULL_RITUAL_PATH = resolve(
  ROOT,
  "components/jarvis/morning-ritual/full-morning-ritual.tsx",
);
const WELCOME_PATH = resolve(
  ROOT,
  "components/jarvis/morning-ritual/welcome-back-screen.tsx",
);
const HOME_PAGE_PATH = resolve(ROOT, "app/page.tsx");
const LOGIN_ACTIONS_PATH = resolve(ROOT, "app/login/actions.ts");
const BRIEFING_PLAYER_PATH = resolve(
  ROOT,
  "components/jarvis/command-center/briefing-player.tsx",
);

const REAL_TIMELINE: MorningRitualBriefingTimeline = {
  durationMs: 25320,
  sentences: [
    { index: 0, text: "Two things stand out today.", startMs: 0, endMs: 4800 },
    {
      index: 1,
      text: "On Melusi, 2 leads have been waiting over a day.",
      startMs: 5000,
      endMs: 9800,
    },
    {
      index: 2,
      text: "Content posting is still 0 of 4 for the week.",
      startMs: 10000,
      endMs: 14800,
    },
    {
      index: 3,
      text: "On personal, nothing's overdue — your next deadline is 6 days out.",
      startMs: 15000,
      endMs: 19800,
    },
    {
      index: 4,
      text: "Suggest Personal mode, starting with the leads.",
      startMs: 20000,
      endMs: 24800,
    },
  ],
};

describe("Morning Ritual phase 6B orchestration", () => {
  it("does not use demo timeline timestamps in production flow source", () => {
    const flowSource = readFileSync(FLOW_PATH, "utf8");
    const gateSource = readFileSync(GATE_PATH, "utf8");

    expect(flowSource).not.toContain("getDemoRitualSnapshot");
    expect(flowSource).not.toContain("FullMorningRitualDemo");
    expect(flowSource).toContain("deriveRitualPlaybackSnapshot");
    expect(flowSource).toContain("extractTranscriptSentences");
    expect(gateSource).toContain("MorningRitualFlow");
    expect(gateSource).not.toContain("SleepScreenWithBackground");
  });

  it("fetches signed audio only through the existing briefing audio route", () => {
    const flowSource = readFileSync(FLOW_PATH, "utf8");

    expect(flowSource).toContain("fetchMorningRitualSignedAudioUrl");
    expect(flowSource).not.toMatch(/\/api\/briefings\/audio\/[^?]/);
    expect(flowSource).not.toContain("audio_storage_path");
    expect(flowSource).not.toContain("audio_content_hash");
    expect(flowSource).not.toContain("userId");
  });

  it("does not autoplay on mount", () => {
    const flowSource = readFileSync(FLOW_PATH, "utf8");
    const preloadEffect = flowSource.match(
      /useEffect\(\(\) => \{[\s\S]*?loadSignedAudioUrl\(briefingDate\);[\s\S]*?\}, \[[\s\S]*?\]\);/,
    )?.[0];

    expect(preloadEffect).toBeTruthy();
    expect(preloadEffect).not.toMatch(/\.play\(/);
    expect(flowSource).toContain('audio.preload = "auto"');
    expect(flowSource).toContain("attemptPlayback");
  });

  it("starts ritual with exact briefing date via POST /api/rituals/morning/start", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ result: "started", ritual: { status: "started" } }),
    );

    await startMorningRitualRequest("2026-08-07", fetchMock);

    expect(fetchMock).toHaveBeenCalledWith("/api/rituals/morning/start", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefingDate: "2026-08-07" }),
    });
  });

  it("blocks duplicate sign in while start is in flight", () => {
    const briefing = {
      briefingDate: "2026-08-07",
      transcript: "x",
      audioStatus: "ready" as const,
      audioGeneratedAt: "2026-08-07T12:00:00.000Z",
      timeline: REAL_TIMELINE,
      recommendedMode: null,
      recommendationSentenceIndex: null,
    };

    expect(
      canStartMorningRitual({
        playbackReadiness: "ready",
        briefing,
        audioPrepared: true,
        startInFlight: true,
      }),
    ).toBe(false);
  });

  it("accepts already_started and already_completed start results", () => {
    expect(parseMorningRitualStartResponse({ result: "already_started" })).toEqual({
      ok: true,
      result: "already_started",
    });
    expect(parseMorningRitualStartResponse({ result: "already_completed" })).toEqual({
      ok: true,
      result: "already_completed",
    });
  });

  it("uses audio currentTimeMs to select active sentence and reveal transcript", () => {
    expect(resolveActiveSentenceIndex(-1, REAL_TIMELINE.sentences)).toBe(-1);
    expect(resolveActiveSentenceIndex(0, REAL_TIMELINE.sentences)).toBe(0);
    expect(resolveActiveSentenceIndex(10000, REAL_TIMELINE.sentences)).toBe(2);
    expect(extractTranscriptSentences(REAL_TIMELINE)[2]).toBe(
      "Content posting is still 0 of 4 for the week.",
    );
  });

  it("keeps recommendation accent neutral before recommendation timestamp", () => {
    expect(
      getRingColor("personal", resolveModeRevealed(19999, "personal", 4, REAL_TIMELINE)),
    ).toBe("#c7cbd6");
  });

  it("transitions Personal to #F0A93B and Melusi to #3B7DDD at recommendation start", () => {
    expect(
      getRingColor("personal", resolveModeRevealed(20000, "personal", 4, REAL_TIMELINE)),
    ).toBe("#F0A93B");
    expect(
      getRingColor("melusi", resolveModeRevealed(20000, "melusi", 4, REAL_TIMELINE)),
    ).toBe("#3B7DDD");
  });

  it("does not complete ritual from final sentence alone", () => {
    const snapshot = deriveRitualPlaybackSnapshot({
      currentTimeMs: REAL_TIMELINE.durationMs,
      timeline: REAL_TIMELINE,
      recommendedMode: "personal",
      recommendationSentenceIndex: 4,
      isPlaying: false,
      audioEnded: false,
    });

    expect(snapshot.activeSentenceIndex).toBe(4);
    expect(
      shouldRevealEnterJarvis({
        completionAcknowledged: false,
        audioEnded: false,
      }),
    ).toBe(false);
  });

  it("reveals Enter Jarvis only after completion success and audio ended", () => {
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
  });

  it("parses completion success without replaying audio", () => {
    expect(parseMorningRitualCompleteResponse({ result: "completed" })).toEqual({
      ok: true,
      result: "completed",
    });
    expect(parseMorningRitualCompleteResponse({ error: "unavailable" })).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("completes ritual with exact briefing date via POST /api/rituals/morning/complete", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ result: "completed", ritual: { status: "completed" } }),
    );

    await completeMorningRitualRequest("2026-08-07", fetchMock);

    expect(fetchMock).toHaveBeenCalledWith("/api/rituals/morning/complete", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefingDate: "2026-08-07" }),
    });
  });

  it("preloads signed audio only for ready full_required briefings", () => {
    expect(
      shouldPreloadMorningRitualAudio({
        ritualState: "full_required",
        playbackReadiness: "ready",
        briefing: {
          briefingDate: "2026-08-07",
          transcript: "x",
          audioStatus: "ready",
          audioGeneratedAt: "2026-08-07T12:00:00.000Z",
          timeline: REAL_TIMELINE,
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
  });

  it("fetches signed audio through GET /api/briefings/audio", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        status: "ready",
        url: "https://example.test/audio.mp3",
        expiresInSeconds: 90,
      }),
    );

    const result = await fetchMorningRitualSignedAudioUrl("2026-08-07", fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/briefings/audio?briefingDate=2026-08-07",
      {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      },
    );
    expect(result).toEqual({
      ok: true,
      url: "https://example.test/audio.mp3",
      expiresInSeconds: 90,
    });
  });

  it("welcome back navigates to /?ritualEntry=complete after flash and never preloads audio", () => {
    const welcomeSource = readFileSync(WELCOME_PATH, "utf8");

    expect(welcomeSource).toContain('router.replace("/?ritualEntry=complete")');
    expect(welcomeSource).not.toContain("fetchMorningRitualSignedAudioUrl");
    expect(welcomeSource).not.toMatch(/HTMLAudioElement|new Audio/);
  });

  it("restarts started rituals from the beginning on refresh", () => {
    const flowSource = readFileSync(FLOW_PATH, "utf8");

    expect(flowSource).toContain('entry.ritualStatus === "started"');
    expect(flowSource).toContain("createInitialStartAcknowledged");
    expect(flowSource).toContain("resetAudioPlayback");
    expect(flowSource).not.toContain("localStorage");
    expect(flowSource).not.toContain("sessionStorage");
  });

  it("keeps demo timeline isolated from production runtime", () => {
    const demoSnapshotAt20s = getDemoRitualSnapshot(20000);
    const realSnapshotAt20s = deriveRitualPlaybackSnapshot({
      currentTimeMs: 20000,
      timeline: REAL_TIMELINE,
      recommendedMode: "personal",
      recommendationSentenceIndex: 4,
      isPlaying: true,
      audioEnded: false,
    });

    expect(demoSnapshotAt20s.recommendedMode).toBe("melusi");
    expect(realSnapshotAt20s.recommendedMode).toBe("personal");
    expect(demoSnapshotAt20s.activeSentenceIndex).toBe(4);
    expect(realSnapshotAt20s.activeSentenceIndex).toBe(4);
  });

  it("does not expose sensitive fields or call OpenAI/TTS/Whisper in client flow", () => {
    const flowSource = readFileSync(FLOW_PATH, "utf8");
    const fullSource = readFileSync(FULL_RITUAL_PATH, "utf8");

    for (const source of [flowSource, fullSource, readFileSync(GATE_PATH, "utf8")]) {
      expect(source).not.toContain("audio_content_hash");
      expect(source).not.toContain("audio_storage_path");
      expect(source).not.toContain("service_role");
      expect(source).not.toMatch(/openai/i);
      expect(source).not.toMatch(/whisper/i);
      expect(source).not.toMatch(/generateMorningBrief/);
    }
  });

  it("routes daily entry through /wake with validated Command Center bypass", () => {
    const homeSource = readFileSync(HOME_PAGE_PATH, "utf8");
    const loginSource = readFileSync(LOGIN_ACTIONS_PATH, "utf8");
    const briefingSource = readFileSync(BRIEFING_PLAYER_PATH, "utf8");

    expect(homeSource).toContain("loadCommandCenter");
    expect(homeSource).not.toContain("MorningRitualFlow");
    expect(homeSource).toContain('ritualEntry === "complete"');
    expect(homeSource).toContain("resolveMorningRitualRootRoute");
    expect(loginSource).toContain('redirect("/wake")');
    expect(briefingSource).toContain("BriefingPlayer");
    expect(briefingSource).not.toContain("MorningRitualFlow");
  });
});
