"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type SyntheticEvent,
} from "react";
import { useCommandCenterMode } from "./command-center-mode-provider";
import { BriefTranscript } from "./brief-transcript";
import { BRIEFING_TRANSCRIPT_DEFAULT_OPEN } from "@/lib/jarvis/briefings/morning-brief-structure";
import {
  buildBriefingWaveformBarHeights,
  BRIEFING_WAVEFORM_BAR_COUNT,
} from "@/lib/jarvis/briefings/briefing-waveform";
import {
  buildAudioFetchUrl,
  buildAudioRetryRequestBody,
  computePlaybackProgress,
  computePlayedBarCount,
  derivePlaybackPhase,
  formatAudioTime,
  getAudioStatusMessage,
  getPlayButtonAriaLabel,
  getRetryButtonLabel,
  isPlayControlEnabled,
  isSignedUrlStale,
  mapAudioFetchPayload,
  mapRetryPayload,
  resolveSignedUrlTtlSeconds,
  shouldFetchSignedUrl,
  shouldResetPlaybackState,
  shouldShowRetryAction,
  type BriefingPlaybackIdentity,
} from "@/lib/jarvis/briefings/briefing-audio-player";
import type { MorningBriefAudioStatus } from "@/lib/jarvis/dashboard/load-command-center";

function WaveformBars({
  className,
  progress,
}: {
  className?: string;
  progress: number;
}) {
  const heights = buildBriefingWaveformBarHeights();
  const playedBars = computePlayedBarCount(progress, BRIEFING_WAVEFORM_BAR_COUNT);

  return (
    <div className={className} aria-hidden="true">
      {heights.map((height, index) => (
        <div
          key={index}
          className={`cc2-wave-bar${index < playedBars ? " cc2-wave-bar--played" : ""}`}
          style={{ height: `${height}px` }}
        />
      ))}
    </div>
  );
}

type BriefingPlayerProps = {
  transcript: string | null;
  priorityText: string | null;
  briefingStatus: string | null;
  audioStatus: MorningBriefAudioStatus;
  audioGeneratedAt: string | null;
  briefingDate: string | null;
  onFollowUp: (prompt: string, key: string) => void;
  followUpLoading: boolean;
  followUpUsed: Set<string>;
};

const FOLLOW_UPS = [
  { key: "overdue", label: "What's overdue?" },
  { key: "wait", label: "What can wait?" },
  { key: "melusi", label: "How's Melusi trending?" },
  { key: "week", label: "What's my week look like?" },
] as const;

export function BriefingPlayer({
  transcript,
  priorityText,
  briefingStatus,
  audioStatus: initialAudioStatus,
  audioGeneratedAt: initialAudioGeneratedAt,
  briefingDate,
  onFollowUp,
  followUpLoading,
  followUpUsed,
}: BriefingPlayerProps) {
  const { mode } = useCommandCenterMode();
  const [transcriptOpen, setTranscriptOpen] = useState(
    BRIEFING_TRANSCRIPT_DEFAULT_OPEN,
  );
  const [audioStatus, setAudioStatus] =
    useState<MorningBriefAudioStatus>(initialAudioStatus);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [signedUrlObtainedAt, setSignedUrlObtainedAt] = useState<number | null>(
    null,
  );
  const [signedUrlExpiresInSeconds, setSignedUrlExpiresInSeconds] = useState<
    number | null
  >(null);
  const [urlRefreshUsed, setUrlRefreshUsed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const fetchInFlightRef = useRef(false);
  const retryInFlightRef = useRef(false);
  const urlRefreshUsedRef = useRef(false);
  const signedUrlRef = useRef<string | null>(null);
  const signedUrlObtainedAtRef = useRef<number | null>(null);
  const signedUrlExpiresInSecondsRef = useRef<number | null>(null);
  const playbackIdentityRef = useRef<BriefingPlaybackIdentity>({
    briefingDate,
    audioStatus: initialAudioStatus,
    audioGeneratedAt: initialAudioGeneratedAt,
  });
  const startPlaybackRef = useRef<
    (options?: { forceRefresh?: boolean }) => Promise<void>
  >(() => Promise.resolve());
  const mediaRecoveryInFlightRef = useRef(false);

  const hasTranscript = Boolean(transcript?.trim());
  const isBriefGenerating = briefingStatus === "generating";
  const isBriefFailed = briefingStatus === "failed";
  const progress = computePlaybackProgress(currentTime, duration);
  const playEnabled = isPlayControlEnabled(audioStatus, { isRetrying, loadingUrl });
  const showRetry =
    briefingDate !== null && shouldShowRetryAction(audioStatus);
  const statusMessage = getAudioStatusMessage(audioStatus, {
    isRetrying,
    playbackError,
  });

  const clearSignedUrlMemory = useCallback(() => {
    signedUrlRef.current = null;
    signedUrlObtainedAtRef.current = null;
    signedUrlExpiresInSecondsRef.current = null;
    setSignedUrl(null);
    setSignedUrlObtainedAt(null);
    setSignedUrlExpiresInSeconds(null);
  }, []);

  const resetPlayback = useCallback(() => {
    const audio = audioRef.current;

    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }

    setLoadingUrl(false);
    setPlaybackError(null);
    setCurrentTime(0);
    setDuration(null);
    clearSignedUrlMemory();
    urlRefreshUsedRef.current = false;
    setUrlRefreshUsed(false);
    mediaRecoveryInFlightRef.current = false;
    setIsPlaying(false);
    setEnded(false);
    setIsSeeking(false);
    fetchInFlightRef.current = false;
  }, [clearSignedUrlMemory]);

  useEffect(() => {
    const previous = playbackIdentityRef.current;
    const next: BriefingPlaybackIdentity = {
      briefingDate,
      audioStatus: initialAudioStatus,
      audioGeneratedAt: initialAudioGeneratedAt,
    };

    if (shouldResetPlaybackState(previous, next)) {
      resetPlayback();
      setAudioStatus(initialAudioStatus);
      playbackIdentityRef.current = next;
    }
  }, [
    briefingDate,
    initialAudioStatus,
    initialAudioGeneratedAt,
    resetPlayback,
  ]);

  useEffect(() => {
    return () => {
      const audio = audioRef.current;

      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }

      fetchInFlightRef.current = false;
      retryInFlightRef.current = false;
    };
  }, []);

  const fetchSignedUrl = useCallback(
    async (options?: { forceRefresh?: boolean }): Promise<{
      url: string;
      expiresInSeconds: number;
    } | null> => {
      if (!briefingDate) {
        return null;
      }

      const forceRefresh = options?.forceRefresh ?? false;
      const nowMs = Date.now();

      if (
        !shouldFetchSignedUrl({
          signedUrl: signedUrlRef.current,
          obtainedAtMs: signedUrlObtainedAtRef.current,
          expiresInSeconds: signedUrlExpiresInSecondsRef.current,
          nowMs,
          fetchInFlight: fetchInFlightRef.current,
          forceRefresh,
        })
      ) {
        const cachedUrl = signedUrlRef.current;

        if (!cachedUrl) {
          return null;
        }

        return {
          url: cachedUrl,
          expiresInSeconds: resolveSignedUrlTtlSeconds(
            signedUrlExpiresInSecondsRef.current,
          ),
        };
      }

      if (fetchInFlightRef.current) {
        return null;
      }

      fetchInFlightRef.current = true;
      setLoadingUrl(true);
      setPlaybackError(null);

      try {
        const response = await fetch(buildAudioFetchUrl(briefingDate), {
          credentials: "same-origin",
        });
        const payload = (await response.json()) as {
          status?: string;
          url?: string;
          expiresInSeconds?: number;
          error?: string;
        };
        const result = mapAudioFetchPayload(payload);

        if (!result.ok) {
          if (result.reason === "not_ready" && payload.status === "generating") {
            setAudioStatus("generating");
          } else if (result.reason === "not_ready" && payload.status === "failed") {
            setAudioStatus("failed");
          } else {
            setPlaybackError("Audio unavailable");
          }

          return null;
        }

        const obtainedAt = Date.now();
        signedUrlRef.current = result.url;
        signedUrlObtainedAtRef.current = obtainedAt;
        signedUrlExpiresInSecondsRef.current = result.expiresInSeconds;
        setSignedUrl(result.url);
        setSignedUrlObtainedAt(obtainedAt);
        setSignedUrlExpiresInSeconds(result.expiresInSeconds);
        return result;
      } catch {
        setPlaybackError("Audio unavailable");
        return null;
      } finally {
        fetchInFlightRef.current = false;
        setLoadingUrl(false);
      }
    },
    [briefingDate],
  );

  const handleMediaFailure = useCallback(async () => {
    if (urlRefreshUsedRef.current || mediaRecoveryInFlightRef.current) {
      return;
    }

    mediaRecoveryInFlightRef.current = true;
    urlRefreshUsedRef.current = true;
    setUrlRefreshUsed(true);
    clearSignedUrlMemory();

    try {
      await startPlaybackRef.current({ forceRefresh: true });
    } finally {
      mediaRecoveryInFlightRef.current = false;
    }
  }, [clearSignedUrlMemory]);

  const startPlayback = useCallback(
    async (options?: { forceRefresh?: boolean }) => {
      const forceRefresh = options?.forceRefresh ?? false;
      const audio = audioRef.current;

      if (!audio || audioStatus !== "ready") {
        return;
      }

      if (ended) {
        audio.currentTime = 0;
        setCurrentTime(0);
        setEnded(false);
      }

      const nowMs = Date.now();
      const ttlSeconds = resolveSignedUrlTtlSeconds(
        signedUrlExpiresInSecondsRef.current,
      );
      const needsFreshUrl =
        forceRefresh ||
        !signedUrlRef.current ||
        isSignedUrlStale(signedUrlObtainedAtRef.current, nowMs, ttlSeconds);

      let urlResult = signedUrlRef.current
        ? {
            url: signedUrlRef.current,
            expiresInSeconds: ttlSeconds,
          }
        : null;

      if (needsFreshUrl) {
        urlResult = await fetchSignedUrl({ forceRefresh });
      }

      if (!urlResult) {
        setPlaybackError("Audio unavailable");
        return;
      }

      if (audio.src !== urlResult.url) {
        audio.src = urlResult.url;
        audio.load();
      }

      try {
        await audio.play();
        setIsPlaying(true);
        setPlaybackError(null);
      } catch {
        if (forceRefresh) {
          setPlaybackError("Audio unavailable");
          setIsPlaying(false);
          return;
        }

        await handleMediaFailure();
      }
    },
    [audioStatus, ended, fetchSignedUrl, handleMediaFailure],
  );

  useEffect(() => {
    startPlaybackRef.current = startPlayback;
  }, [startPlayback]);

  const handlePlayPause = useCallback(async () => {
    const audio = audioRef.current;

    if (!audio || !playEnabled) {
      return;
    }

    if (isPlaying) {
      audio.pause();
      return;
    }

    await startPlayback();
  }, [isPlaying, playEnabled, startPlayback]);

  const handleRetry = useCallback(async () => {
    if (!briefingDate || retryInFlightRef.current) {
      return;
    }

    retryInFlightRef.current = true;
    setIsRetrying(true);
    setPlaybackError(null);
    resetPlayback();

    try {
      const response = await fetch("/api/briefings/audio/retry", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: buildAudioRetryRequestBody(briefingDate),
      });
      const payload = (await response.json()) as {
        status?: string;
        error?: string;
      };
      const result = mapRetryPayload(payload);

      if (result === "ready") {
        setAudioStatus("ready");
      } else if (result === "generating") {
        setAudioStatus("generating");
      } else if (result === "failed" || result === "unavailable") {
        setAudioStatus("failed");
      } else if (result === "unauthorized") {
        setPlaybackError("Sign in required");
      } else if (result === "not_found") {
        setPlaybackError("Brief not found");
      } else {
        setAudioStatus("failed");
      }
    } catch {
      setAudioStatus("failed");
    } finally {
      retryInFlightRef.current = false;
      setIsRetrying(false);
    }
  }, [briefingDate, resetPlayback]);

  const handleCheckAgain = useCallback(async () => {
    if (!briefingDate || fetchInFlightRef.current) {
      return;
    }

    fetchInFlightRef.current = true;
    setLoadingUrl(true);

    try {
      const response = await fetch(buildAudioFetchUrl(briefingDate), {
        credentials: "same-origin",
      });
      const payload = (await response.json()) as {
        status?: string;
        error?: string;
      };

      if (payload.status === "ready") {
        setAudioStatus("ready");
      } else if (payload.status === "generating") {
        setAudioStatus("generating");
      } else if (payload.status === "failed") {
        setAudioStatus("failed");
      }
    } catch {
      setPlaybackError("Audio unavailable");
    } finally {
      fetchInFlightRef.current = false;
      setLoadingUrl(false);
    }
  }, [briefingDate]);

  const handleSeek = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const audio = audioRef.current;
      const nextTime = Number(event.target.value);

      if (!audio || !Number.isFinite(nextTime)) {
        return;
      }

      audio.currentTime = nextTime;
      setCurrentTime(nextTime);
      setEnded(false);
    },
    [],
  );

  const handleLoadedMetadata = useCallback((event: SyntheticEvent<HTMLAudioElement>) => {
    const nextDuration = event.currentTarget.duration;
    setDuration(Number.isFinite(nextDuration) ? nextDuration : null);
  }, []);

  const handleDurationChange = useCallback(
    (event: SyntheticEvent<HTMLAudioElement>) => {
      const nextDuration = event.currentTarget.duration;
      setDuration(Number.isFinite(nextDuration) ? nextDuration : null);
    },
    [],
  );

  const handleTimeUpdate = useCallback(
    (event: SyntheticEvent<HTMLAudioElement>) => {
      if (isSeeking) {
        return;
      }

      setCurrentTime(event.currentTarget.currentTime);
    },
    [isSeeking],
  );

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    setEnded(false);
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setEnded(true);
  }, []);

  const handleAudioError = useCallback(() => {
    void handleMediaFailure();
  }, [handleMediaFailure]);

  const phase = derivePlaybackPhase({
    isPlaying,
    ended,
    loadingUrl,
    hasSignedUrl: Boolean(signedUrl),
  });

  const playButtonLabel = getPlayButtonAriaLabel({
    phase,
    loadingUrl,
  });

  const playButtonSymbol =
    loadingUrl || phase === "loading_url"
      ? "…"
      : isPlaying
        ? "❚❚"
        : "▶";

  const seekMax = duration != null && Number.isFinite(duration) ? duration : 0;
  const timeDisplay =
    audioStatus === "ready"
      ? `${formatAudioTime(currentTime)} / ${formatAudioTime(duration)}`
      : statusMessage;

  return (
    <div className="cc2-listen-card">
      <div className="cc2-listen-label">Your briefing</div>

      <div className="cc2-player" role="group" aria-label="Morning briefing player">
        <button
          type="button"
          className={`cc2-play-btn${loadingUrl ? " cc2-play-btn--loading" : ""}${playEnabled ? " cc2-play-btn--enabled" : ""}`}
          disabled={!playEnabled}
          aria-label={playButtonLabel}
          aria-busy={loadingUrl}
          onClick={() => {
            void handlePlayPause();
          }}
        >
          {playButtonSymbol}
        </button>

        <div className="cc2-player-track">
          <WaveformBars className="cc2-wave" progress={progress} />
          {audioStatus === "ready" ? (
            <input
              type="range"
              className="cc2-seek"
              min={0}
              max={seekMax}
              step={0.1}
              value={Math.min(currentTime, seekMax)}
              aria-label="Seek morning briefing playback"
              aria-valuemin={0}
              aria-valuemax={seekMax}
              aria-valuenow={currentTime}
              aria-valuetext={`${formatAudioTime(currentTime)} of ${formatAudioTime(duration)}`}
              disabled={!signedUrl && !loadingUrl}
              onChange={handleSeek}
              onMouseDown={() => setIsSeeking(true)}
              onMouseUp={() => setIsSeeking(false)}
              onTouchStart={() => setIsSeeking(true)}
              onTouchEnd={() => setIsSeeking(false)}
              onKeyDown={() => setIsSeeking(true)}
              onKeyUp={() => setIsSeeking(false)}
            />
          ) : null}
        </div>

        <span className="cc2-duration" aria-live="polite">
          {timeDisplay}
        </span>
      </div>

      {showRetry ? (
        <div className="cc2-audio-actions">
          <button
            type="button"
            className="cc2-audio-retry-btn"
            disabled={isRetrying}
            aria-busy={isRetrying}
            onClick={() => {
              void handleRetry();
            }}
          >
            {isRetrying ? "Generating audio…" : getRetryButtonLabel(audioStatus)}
          </button>
          {(audioStatus === "generating" || audioStatus === "pending") &&
          !isRetrying ? (
            <button
              type="button"
              className="cc2-audio-check-btn"
              disabled={loadingUrl}
              onClick={() => {
                void handleCheckAgain();
              }}
            >
              Check again
            </button>
          ) : null}
        </div>
      ) : null}

      <audio
        ref={audioRef}
        preload="none"
        aria-hidden="true"
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={handleDurationChange}
        onTimeUpdate={handleTimeUpdate}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        onError={handleAudioError}
      />

      {hasTranscript ? (
        <>
          <button
            type="button"
            className="cc2-transcript-toggle"
            aria-expanded={transcriptOpen}
            onClick={() => setTranscriptOpen((open) => !open)}
          >
            {transcriptOpen ? "Hide transcript" : "Show transcript"}
          </button>
          <BriefTranscript
            transcript={transcript ?? ""}
            priorityText={priorityText}
            open={transcriptOpen}
          />
        </>
      ) : (
        <p className="cc2-transcript-empty">
          {isBriefGenerating
            ? "Your morning brief is being generated."
            : isBriefFailed
              ? "Today's brief could not be generated. Visit Morning Brief to retry."
              : "No morning brief yet. Visit Morning Brief to generate one."}
        </p>
      )}

      <div className="cc2-qbar">
        <div className="cc2-qlabel">
          Ask a follow-up — routed through Jarvis
        </div>
        {FOLLOW_UPS.map((item) => {
          const used = followUpUsed.has(item.key);
          const disabled = used || followUpLoading;

          return (
            <button
              key={item.key}
              type="button"
              className={`cc2-qbtn${used ? " cc2-qbtn--used" : ""}`}
              disabled={disabled}
              title={used ? "Already asked" : undefined}
              onClick={() => onFollowUp(item.label, item.key)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="cc2-verdict-row">
        <div className="cc2-verdict-text">
          Suggested: <b>{mode === "melusi" ? "Melusi mode" : "Personal mode"}</b>
        </div>
        <ModeSwitcherInline />
      </div>
    </div>
  );
}

function ModeSwitcherInline() {
  const { mode, setMode } = useCommandCenterMode();

  return (
    <div className="cc2-verdict-actions">
      <button
        type="button"
        className="cc2-btn"
        onClick={() => setMode("personal")}
        aria-pressed={mode === "personal"}
      >
        Switch to personal
      </button>
      <button
        type="button"
        className="cc2-btn cc2-btn--primary"
        onClick={() => setMode("melusi")}
        aria-pressed={mode === "melusi"}
      >
        Go to Melusi
      </button>
    </div>
  );
}

export { ModeSwitcherInline as ModeSwitcher };
