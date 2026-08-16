"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  SIGNED_URL_REFRESH_BUFFER_SECONDS,
  isSignedUrlStale,
  resolveSignedUrlTtlSeconds,
} from "@/lib/jarvis/briefings/briefing-audio-player";
import {
  completeMorningRitualRequest,
  fetchMorningRitualSignedAudioUrl,
  startMorningRitualRequest,
} from "@/lib/jarvis/morning-ritual/morning-ritual-api";
import {
  canStartMorningRitual,
  computeSignedUrlRefreshDelayMs,
  createInitialStartAcknowledged,
  deriveRitualPlaybackSnapshot,
  extractTranscriptSentences,
  isAutoplayNotAllowedError,
  isMorningRitualStartAcknowledgedResult,
  resolvePlaybackReadinessMessage,
  shouldApplySignedUrlToAudio,
  shouldPreloadMorningRitualAudio,
  shouldRequestCompletion,
  shouldRetryPlaybackWithStartPost,
  shouldRevealEnterJarvis,
} from "@/lib/jarvis/morning-ritual/morning-ritual-playback";
import { SLEEP_STARFIELD } from "@/lib/jarvis/morning-ritual/starfield";
import type { MorningRitualEntry } from "@/lib/jarvis/rituals/load-morning-ritual-entry";

import { FullMorningRitual } from "./full-morning-ritual";
import styles from "./morning-ritual.module.css";
import { RitualBackground } from "./ritual-background";

type MorningRitualFlowProps = {
  entry: MorningRitualEntry;
};

function createAudioElement(): HTMLAudioElement {
  const audio = new Audio();
  audio.preload = "auto";
  return audio;
}

export function MorningRitualFlow({ entry }: MorningRitualFlowProps) {
  const router = useRouter();
  const briefing = entry.briefing;
  const timeline = briefing?.timeline ?? null;
  const briefingDate = briefing?.briefingDate ?? entry.briefingDate;
  const resumedFromStarted = entry.ritualStatus === "started";

  const [phase, setPhase] = useState<"sleep" | "ritual">(() =>
    resumedFromStarted ? "ritual" : "sleep",
  );
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioEnded, setAudioEnded] = useState(false);
  const [audioPrepared, setAudioPrepared] = useState(false);
  const [startInFlight, setStartInFlight] = useState(false);
  const [completionAcknowledged, setCompletionAcknowledged] = useState(false);
  const [completionInFlight, setCompletionInFlight] = useState(false);
  const [completionFailed, setCompletionFailed] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(resumedFromStarted);
  const [startError, setStartError] = useState<string | null>(null);
  const [readinessMessage] = useState<string | null>(() =>
    resolvePlaybackReadinessMessage(entry.playbackReadiness),
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const signedUrlRef = useRef<string | null>(null);
  const signedUrlObtainedAtRef = useRef<number | null>(null);
  const signedUrlExpiresInSecondsRef = useRef<number>(90);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const completionRequestedRef = useRef(false);
  const startRequestedRef = useRef(false);
  const fetchInFlightRef = useRef(false);
  const fetchGenerationRef = useRef(0);
  const playbackSessionLockedRef = useRef(false);
  const startAcknowledgedRef = useRef(createInitialStartAcknowledged(entry.ritualStatus));
  const audioEndedRef = useRef(false);
  const unmountedRef = useRef(false);
  const loadSignedAudioUrlRef = useRef<
    (date: string, options?: { refreshOnly?: boolean; force?: boolean }) => Promise<void>
  >(() => Promise.resolve());

  const shouldPreload = shouldPreloadMorningRitualAudio({
    ritualState: entry.ritualState,
    playbackReadiness: entry.playbackReadiness,
    briefing,
  });

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const resetAudioPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    setCurrentTimeMs(0);
    setIsPlaying(false);
    setAudioEnded(false);
    audioEndedRef.current = false;
  }, []);

  const lockPlaybackSession = useCallback(() => {
    playbackSessionLockedRef.current = true;
    clearRefreshTimer();
  }, [clearRefreshTimer]);

  const releasePlaybackSession = useCallback(() => {
    playbackSessionLockedRef.current = false;
  }, []);

  const scheduleSignedUrlRefresh = useCallback(
    (expiresInSeconds: number) => {
      clearRefreshTimer();

      if (!briefingDate || !shouldPreload || playbackSessionLockedRef.current) {
        return;
      }

      const delayMs = computeSignedUrlRefreshDelayMs(
        expiresInSeconds,
        SIGNED_URL_REFRESH_BUFFER_SECONDS,
      );

      refreshTimerRef.current = setTimeout(() => {
        void loadSignedAudioUrlRef.current(briefingDate, { refreshOnly: true });
      }, delayMs);
    },
    [briefingDate, clearRefreshTimer, shouldPreload],
  );

  const applySignedUrlToAudio = useCallback(
    (url: string, expiresInSeconds: number) => {
      signedUrlRef.current = url;
      signedUrlObtainedAtRef.current = Date.now();
      signedUrlExpiresInSecondsRef.current = expiresInSeconds;

      const audio = audioRef.current ?? createAudioElement();
      audioRef.current = audio;
      audio.preload = "auto";
      setAudioPrepared(false);
      audio.src = url;
      audio.load();
      scheduleSignedUrlRefresh(expiresInSeconds);
    },
    [scheduleSignedUrlRefresh],
  );

  const loadSignedAudioUrl = useCallback(
    async (
      date: string,
      options?: { refreshOnly?: boolean; force?: boolean },
    ) => {
      if (fetchInFlightRef.current) {
        return;
      }

      const nowMs = Date.now();
      const ttlSeconds = resolveSignedUrlTtlSeconds(
        signedUrlExpiresInSecondsRef.current,
      );

      if (
        !options?.force &&
        signedUrlRef.current &&
        !isSignedUrlStale(
          signedUrlObtainedAtRef.current,
          nowMs,
          ttlSeconds,
          SIGNED_URL_REFRESH_BUFFER_SECONDS,
        )
      ) {
        return;
      }

      fetchInFlightRef.current = true;
      const fetchGenerationAtStart = ++fetchGenerationRef.current;

      try {
        const result = await fetchMorningRitualSignedAudioUrl(date);

        if (
          !shouldApplySignedUrlToAudio({
            playbackSessionLocked: playbackSessionLockedRef.current,
            fetchGeneration: fetchGenerationRef.current,
            fetchGenerationAtStart,
            unmounted: unmountedRef.current,
          })
        ) {
          return;
        }

        if (result.ok) {
          applySignedUrlToAudio(result.url, result.expiresInSeconds);
          return;
        }

        if (!options?.refreshOnly) {
          setAudioPrepared(false);
        }
      } catch {
        if (!options?.refreshOnly) {
          setAudioPrepared(false);
        }
      } finally {
        fetchInFlightRef.current = false;
      }
    },
    [applySignedUrlToAudio],
  );

  loadSignedAudioUrlRef.current = loadSignedAudioUrl;

  const releasePlaybackSessionAndPreload = useCallback(() => {
    releasePlaybackSession();

    if (briefingDate && shouldPreload) {
      void loadSignedAudioUrl(briefingDate, { force: true });
    }
  }, [briefingDate, loadSignedAudioUrl, releasePlaybackSession, shouldPreload]);

  const startRaf = useCallback(() => {
    stopRaf();

    const tick = () => {
      const audio = audioRef.current;

      if (audio && !audio.paused && !audio.ended) {
        setCurrentTimeMs(audio.currentTime * 1000);
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [stopRaf]);

  const handleAudioPlay = useCallback(() => {
    setIsPlaying(true);
    setAutoplayBlocked(false);
    startRaf();
  }, [startRaf]);

  const handleAudioPause = useCallback(() => {
    setIsPlaying(false);
    stopRaf();
  }, [stopRaf]);

  const requestCompletion = useCallback(async () => {
    if (!briefingDate || completionRequestedRef.current) {
      return;
    }

    completionRequestedRef.current = true;
    setCompletionInFlight(true);
    setCompletionFailed(false);

    try {
      const result = await completeMorningRitualRequest(briefingDate);

      if (result.ok) {
        setCompletionAcknowledged(true);
        setCompletionFailed(false);
      } else {
        completionRequestedRef.current = false;
        setCompletionFailed(true);
      }
    } catch {
      completionRequestedRef.current = false;
      setCompletionFailed(true);
    } finally {
      setCompletionInFlight(false);
    }
  }, [briefingDate]);

  const maybeRequestCompletion = useCallback(() => {
    if (
      shouldRequestCompletion({
        audioEnded: audioEndedRef.current,
        startAcknowledged: startAcknowledgedRef.current,
      })
    ) {
      void requestCompletion();
    }
  }, [requestCompletion]);

  const acknowledgeStartResult = useCallback(
    (result: "started" | "already_started" | "already_completed") => {
      if (result === "already_completed") {
        return "already_completed" as const;
      }

      if (isMorningRitualStartAcknowledgedResult(result)) {
        startAcknowledgedRef.current = true;
        maybeRequestCompletion();
        return "acknowledged" as const;
      }

      return "failed" as const;
    },
    [maybeRequestCompletion],
  );

  const handleAudioEnded = useCallback(() => {
    setIsPlaying(false);
    setAudioEnded(true);
    audioEndedRef.current = true;
    stopRaf();

    const audio = audioRef.current;
    if (audio && timeline) {
      setCurrentTimeMs(timeline.durationMs);
    }

    maybeRequestCompletion();
  }, [maybeRequestCompletion, stopRaf, timeline]);

  const attachAudioListeners = useCallback(
    (audio: HTMLAudioElement) => {
      audio.onloadedmetadata = () => {
        // Metadata alone does not mean the source is playable yet.
      };
      audio.oncanplay = () => {
        setAudioPrepared(true);
      };
      audio.onplay = handleAudioPlay;
      audio.onpause = handleAudioPause;
      audio.onended = handleAudioEnded;
      audio.onerror = () => {
        setAudioPrepared(false);
        setIsPlaying(false);
        stopRaf();
      };
    },
    [handleAudioEnded, handleAudioPause, handleAudioPlay, stopRaf],
  );

  useEffect(() => {
    unmountedRef.current = false;

    if (!shouldPreload || !briefingDate) {
      return () => {
        unmountedRef.current = true;
        fetchGenerationRef.current += 1;
      };
    }

    if (!audioRef.current) {
      audioRef.current = createAudioElement();
      attachAudioListeners(audioRef.current);
    }

    void loadSignedAudioUrl(briefingDate);

    return () => {
      unmountedRef.current = true;
      fetchGenerationRef.current += 1;
      clearRefreshTimer();
      stopRaf();
      const audio = audioRef.current;

      if (audio) {
        audio.onloadedmetadata = null;
        audio.oncanplay = null;
        audio.onplay = null;
        audio.onpause = null;
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }

      audioRef.current = null;
    };
  }, [
    attachAudioListeners,
    briefingDate,
    clearRefreshTimer,
    loadSignedAudioUrl,
    shouldPreload,
    stopRaf,
  ]);

  const attemptPlayback = useCallback(async (): Promise<boolean> => {
    const audio = audioRef.current;

    if (!audio || !audioPrepared) {
      setAutoplayBlocked(true);
      return false;
    }

    audio.currentTime = 0;
    setCurrentTimeMs(0);
    setAudioEnded(false);
    audioEndedRef.current = false;

    try {
      await audio.play();
      return true;
    } catch (error) {
      if (isAutoplayNotAllowedError(error)) {
        setAutoplayBlocked(true);
        return false;
      }

      throw error;
    }
  }, [audioPrepared]);

  const handleSignIn = useCallback(async () => {
    if (
      !briefingDate ||
      !briefing ||
      !timeline ||
      startRequestedRef.current ||
      !canStartMorningRitual({
        playbackReadiness: entry.playbackReadiness,
        briefing,
        audioPrepared,
        startInFlight,
      })
    ) {
      return;
    }

    startRequestedRef.current = true;
    setStartInFlight(true);
    setStartError(null);
    setPhase("ritual");
    lockPlaybackSession();

    const startPromise = startMorningRitualRequest(briefingDate);
    const playPromise = attemptPlayback();

    try {
      const [startResult, playbackStarted] = await Promise.all([
        startPromise,
        playPromise,
      ]);

      if (!startResult.ok) {
        resetAudioPlayback();
        releasePlaybackSessionAndPreload();
        setPhase("sleep");
        setAutoplayBlocked(false);
        setStartError("Could not start the morning ritual. Try again.");
        return;
      }

      const ack = acknowledgeStartResult(startResult.result);

      if (ack === "already_completed") {
        resetAudioPlayback();
        releasePlaybackSession();
        setPhase("sleep");
        setAutoplayBlocked(false);
        router.refresh();
        return;
      }

      if (ack === "failed") {
        resetAudioPlayback();
        releasePlaybackSessionAndPreload();
        setPhase("sleep");
        setAutoplayBlocked(false);
        setStartError("Could not start the morning ritual. Try again.");
        return;
      }

      if (!playbackStarted) {
        setAutoplayBlocked(true);
      }
    } catch {
      resetAudioPlayback();
      releasePlaybackSessionAndPreload();
      setPhase("sleep");
      setAutoplayBlocked(false);
      setStartError("Could not start the morning ritual. Try again.");
    } finally {
      startRequestedRef.current = false;
      setStartInFlight(false);
    }
  }, [
    acknowledgeStartResult,
    attemptPlayback,
    audioPrepared,
    briefing,
    briefingDate,
    entry.playbackReadiness,
    lockPlaybackSession,
    releasePlaybackSession,
    releasePlaybackSessionAndPreload,
    resetAudioPlayback,
    router,
    startInFlight,
    timeline,
  ]);

  const handlePlaybackRetry = useCallback(async () => {
    if (!briefingDate || startRequestedRef.current) {
      return;
    }

    if (!audioPrepared) {
      setAutoplayBlocked(true);
      return;
    }

    if (shouldRetryPlaybackWithStartPost(startAcknowledgedRef.current)) {
      startRequestedRef.current = true;
      setStartInFlight(true);

      try {
        const startResult = await startMorningRitualRequest(briefingDate);

        if (!startResult.ok) {
          resetAudioPlayback();
          setAutoplayBlocked(true);
          return;
        }

        const ack = acknowledgeStartResult(startResult.result);

        if (ack === "already_completed") {
          resetAudioPlayback();
          releasePlaybackSession();
          setAutoplayBlocked(false);
          router.refresh();
          return;
        }

        if (ack === "failed") {
          resetAudioPlayback();
          setAutoplayBlocked(true);
          return;
        }
      } finally {
        startRequestedRef.current = false;
        setStartInFlight(false);
      }
    }

    const audio = audioRef.current;
    if (!audio) {
      setAutoplayBlocked(true);
      return;
    }

    audio.currentTime = 0;
    setCurrentTimeMs(0);
    setAudioEnded(false);
    audioEndedRef.current = false;

    try {
      await audio.play();
    } catch (error) {
      if (isAutoplayNotAllowedError(error)) {
        setAutoplayBlocked(true);
        return;
      }

      throw error;
    }
  }, [
    acknowledgeStartResult,
    audioPrepared,
    briefingDate,
    releasePlaybackSession,
    resetAudioPlayback,
    router,
  ]);

  const handleCompletionRetry = useCallback(async () => {
    completionRequestedRef.current = false;
    await requestCompletion();
  }, [requestCompletion]);

  const handleEnterJarvis = useCallback(() => {
    router.push("/?ritualEntry=complete");
  }, [router]);

  const signInEnabled = canStartMorningRitual({
    playbackReadiness: entry.playbackReadiness,
    briefing,
    audioPrepared,
    startInFlight,
  });

  if (phase === "ritual" && briefing && timeline) {
    const snapshot = deriveRitualPlaybackSnapshot({
      currentTimeMs,
      timeline,
      recommendedMode: briefing.recommendedMode,
      recommendationSentenceIndex: briefing.recommendationSentenceIndex,
      isPlaying,
      audioEnded,
    });

    const showEnterJarvis = shouldRevealEnterJarvis({
      completionAcknowledged,
      audioEnded,
    });

    const playbackPreparing = autoplayBlocked && !audioPrepared;

    return (
      <FullMorningRitual
        displayName={entry.displayName}
        ritualDate={entry.ritualDate}
        transcript={extractTranscriptSentences(timeline)}
        activeSentenceIndex={snapshot.activeSentenceIndex}
        recommendedMode={snapshot.recommendedMode}
        modeRevealed={snapshot.modeRevealed}
        isPlaying={snapshot.isPlaying}
        isFinished={showEnterJarvis}
        completionPending={audioEnded && completionInFlight}
        completionFailed={completionFailed}
        autoplayBlocked={autoplayBlocked}
        playbackPreparing={playbackPreparing}
        onEnterJarvis={handleEnterJarvis}
        onPlaybackRetry={() => {
          void handlePlaybackRetry();
        }}
        onCompletionRetry={() => {
          void handleCompletionRetry();
        }}
      />
    );
  }

  return (
    <>
      <RitualBackground stars={SLEEP_STARFIELD} showAurora3 />
      <div className={styles.content} data-testid="sleep-screen">
        <div className={styles.logoMark} data-testid="sleep-logo">
          <span className={styles.logoCore} />
          <span className={styles.logoPing} />
        </div>
        <h1 className={styles.sleepTitle}>JARVIS</h1>
        <p className={styles.sleepSubtitle}>Sleeping</p>
        {readinessMessage ? (
          <p className={styles.readinessMessage} data-testid="readiness-message">
            {readinessMessage}
          </p>
        ) : null}
        {startError ? (
          <p className={styles.ritualErrorMessage} data-testid="start-error-message">
            {startError}
          </p>
        ) : null}
        <button
          type="button"
          className={
            signInEnabled ? styles.signInButton : styles.signInButtonDisabled
          }
          data-testid="sign-in-button"
          data-enabled={signInEnabled ? "true" : "false"}
          disabled={!signInEnabled}
          onClick={() => {
            void handleSignIn();
          }}
        >
          Sign in
        </button>
        <form
          action="/api/rituals/morning/bypass"
          method="POST"
          className={styles.continueToJarvisForm}
        >
          <input type="hidden" name="ritualDate" value={entry.ritualDate} />
          <button
            type="submit"
            className={styles.continueToJarvisButton}
            data-testid="continue-to-jarvis-button"
          >
            Continue to Jarvis
          </button>
        </form>
      </div>
    </>
  );
}
