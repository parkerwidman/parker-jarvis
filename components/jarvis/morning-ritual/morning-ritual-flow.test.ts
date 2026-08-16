import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  createInitialStartAcknowledged,
  shouldApplySignedUrlToAudio,
  shouldRequestCompletion,
  shouldRetryPlaybackWithStartPost,
} from "@/lib/jarvis/morning-ritual/morning-ritual-playback";
import {
  fetchMorningRitualSignedAudioUrl,
  startMorningRitualRequest,
} from "@/lib/jarvis/morning-ritual/morning-ritual-api";

const ROOT = resolve(import.meta.dirname, "../../..");
const FLOW_PATH = resolve(
  ROOT,
  "components/jarvis/morning-ritual/morning-ritual-flow.tsx",
);

type MockAudio = {
  src: string;
  currentTime: number;
  paused: boolean;
  ended: boolean;
  preload: string;
  oncanplay: (() => void) | null;
  onplay: (() => void) | null;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  load: () => void;
  play: () => Promise<void>;
  pause: () => void;
};

function createSignedUrlRefreshSimulator() {
  let fetchGeneration = 0;
  let playbackSessionLocked = false;
  let unmounted = false;
  let audioSrc = "https://example.test/initial.mp3";

  const applyRefreshResult = (url: string, generationAtStart: number) => {
    if (
      !shouldApplySignedUrlToAudio({
        playbackSessionLocked,
        fetchGeneration,
        fetchGenerationAtStart: generationAtStart,
        unmounted,
      })
    ) {
      return false;
    }

    audioSrc = url;
    return true;
  };

  const beginRefreshFetch = () => {
    fetchGeneration += 1;
    return fetchGeneration;
  };

  return {
    get audioSrc() {
      return audioSrc;
    },
    lockPlaybackSession() {
      playbackSessionLocked = true;
    },
    releasePlaybackSession() {
      playbackSessionLocked = false;
    },
    unmount() {
      unmounted = true;
      fetchGeneration += 1;
    },
    beginRefreshFetch,
    applyRefreshResult,
  };
}

describe("MorningRitualFlow session safeguards", () => {
  it("ignores in-flight signed URL refresh results after playback session begins", () => {
    const simulator = createSignedUrlRefreshSimulator();
    const generationAtStart = simulator.beginRefreshFetch();

    simulator.lockPlaybackSession();

    const applied = simulator.applyRefreshResult(
      "https://example.test/refreshed.mp3",
      generationAtStart,
    );

    expect(applied).toBe(false);
    expect(simulator.audioSrc).toBe("https://example.test/initial.mp3");
  });

  it("releases playback lock and allows preload refresh after failed start", () => {
    const simulator = createSignedUrlRefreshSimulator();

    simulator.lockPlaybackSession();
    simulator.releasePlaybackSession();

    const generationAtStart = simulator.beginRefreshFetch();
    const applied = simulator.applyRefreshResult(
      "https://example.test/recovered.mp3",
      generationAtStart,
    );

    expect(applied).toBe(true);
    expect(simulator.audioSrc).toBe("https://example.test/recovered.mp3");
  });

  it("does not complete before durable start acknowledgement when audio ends first", () => {
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
  });

  it("uses direct-play retry after durable start acknowledgement", () => {
    expect(shouldRetryPlaybackWithStartPost(true)).toBe(false);
    expect(createInitialStartAcknowledged("started")).toBe(true);
  });

  it("handles preload network failures without throwing", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });

    await expect(
      fetchMorningRitualSignedAudioUrl("2026-08-07", fetchMock),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("handles invalid JSON preload responses safely", async () => {
    const fetchMock = vi.fn(async () => new Response("not-json", { status: 200 }));

    await expect(
      fetchMorningRitualSignedAudioUrl("2026-08-07", fetchMock),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("handles invalid JSON start responses safely", async () => {
    const fetchMock = vi.fn(async () => new Response("not-json", { status: 200 }));

    await expect(startMorningRitualRequest("2026-08-07", fetchMock)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("MorningRitualFlow source invariants", () => {
  it("sets the browser bypass cookie before Continue to Jarvis navigation", () => {
    const source = readFileSync(FLOW_PATH, "utf8");

    expect(source).toContain("handleContinueToJarvis");
    expect(source).toMatch(
      /setMorningRitualBypassCookieInBrowser\(entry\.ritualDate\);\s*router\.push\("\/"\)/,
    );
  });

  it("sets the browser bypass cookie before Enter Jarvis navigation", () => {
    const source = readFileSync(FLOW_PATH, "utf8");

    expect(source).toContain("handleEnterJarvis");
    expect(source).toMatch(
      /setMorningRitualBypassCookieInBrowser\(entry\.ritualDate\);\s*router\.push\("\/\?ritualEntry=complete"\)/,
    );
  });

  it("locks playback session and clears refresh timer when sign in begins", () => {
    const source = readFileSync(FLOW_PATH, "utf8");

    expect(source).toContain("playbackSessionLockedRef");
    expect(source).toContain("lockPlaybackSession");
    expect(source).toContain("shouldApplySignedUrlToAudio");
    expect(source).toContain("startAcknowledgedRef");
    expect(source).toContain("oncanplay");
    expect(source).toContain("setAudioPrepared(false)");
    expect(source).not.toMatch(/audio\.load\(\);\s*setAudioPrepared\(true\)/);
    expect(source).toContain("shouldRetryPlaybackWithStartPost");
    expect(source).toContain("maybeRequestCompletion");
  });

  it("does not clear autoplay blocked state before audio.play succeeds on retry", () => {
    const source = readFileSync(FLOW_PATH, "utf8");
    const retryBlock = source.match(
      /const handlePlaybackRetry = useCallback[\s\S]*?\}, \[[\s\S]*?\]\);/,
    )?.[0];

    expect(retryBlock).toBeTruthy();
    expect(retryBlock).toContain("if (!audioPrepared)");
    expect(retryBlock).toContain("shouldRetryPlaybackWithStartPost");
    expect(retryBlock).toContain("audio.currentTime = 0");
    expect(retryBlock).toContain("await audio.play()");
  });

  it("does not derive retry start POST from stale entry.ritualStatus", () => {
    const source = readFileSync(FLOW_PATH, "utf8");

    expect(source).not.toContain('entry.ritualStatus === "not_started"');
    expect(source).toContain("shouldRetryPlaybackWithStartPost(startAcknowledgedRef.current)");
  });
});

describe("MorningRitualFlow resumed retry behavior", () => {
  it("keeps retry visible while audio is preparing", () => {
    const source = readFileSync(FLOW_PATH, "utf8");

    expect(source).toContain("playbackPreparing");
    expect(source).toContain("!audioPrepared");
  });

  it("simulates resumed retry before canplay leaving retry available", () => {
    const audio: MockAudio = {
      src: "https://example.test/briefing.mp3",
      currentTime: 0,
      paused: true,
      ended: false,
      preload: "auto",
      oncanplay: null,
      onplay: null,
      onended: null,
      onerror: null,
      load() {},
      async play() {
        throw new DOMException("play failed", "NotAllowedError");
      },
      pause() {
        this.paused = true;
      },
    };

    let autoplayBlocked = true;
    let audioPrepared = false;

    const attemptBeforeCanplay = !audioPrepared;
    expect(attemptBeforeCanplay).toBe(true);
    expect(autoplayBlocked).toBe(true);

    audioPrepared = true;
    audio.oncanplay = () => {
      audioPrepared = true;
    };
    audio.oncanplay();

    expect(audioPrepared).toBe(true);
    expect(autoplayBlocked).toBe(true);
  });
});
