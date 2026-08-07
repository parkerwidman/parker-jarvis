"use client";

import { useState } from "react";
import { useCommandCenterMode } from "./command-center-mode-provider";
import { BriefTranscript } from "./brief-transcript";
import { BRIEFING_TRANSCRIPT_DEFAULT_OPEN } from "@/lib/jarvis/briefings/morning-brief-structure";
import { buildBriefingWaveformBarHeights } from "@/lib/jarvis/briefings/briefing-waveform";

function WaveformBars({ className }: { className?: string }) {
  const heights = buildBriefingWaveformBarHeights();

  return (
    <div className={className} aria-hidden="true">
      {heights.map((height, index) => (
        <div
          key={index}
          className="cc2-wave-bar"
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
  onFollowUp,
  followUpLoading,
  followUpUsed,
}: BriefingPlayerProps) {
  const { mode } = useCommandCenterMode();
  const [transcriptOpen, setTranscriptOpen] = useState(
    BRIEFING_TRANSCRIPT_DEFAULT_OPEN,
  );

  const hasTranscript = Boolean(transcript?.trim());
  const isGenerating = briefingStatus === "generating";
  const isFailed = briefingStatus === "failed";

  let statusLabel = "Audio generation coming next";
  if (isGenerating) {
    statusLabel = "Briefing is generating…";
  } else if (isFailed) {
    statusLabel = "Brief unavailable today";
  } else if (hasTranscript) {
    statusLabel = "Transcript ready · audio coming next";
  }

  return (
    <div className="cc2-listen-card">
      <div className="cc2-listen-label">Your briefing</div>

      <div className="cc2-player" role="group" aria-label="Morning briefing player">
        <button
          type="button"
          className="cc2-play-btn"
          disabled
          aria-label="Audio playback unavailable — coming in a future update"
          title="Audio generation coming next"
        >
          ▶
        </button>
        <WaveformBars className="cc2-wave" />
        <span className="cc2-duration" aria-live="polite">
          {statusLabel}
        </span>
      </div>

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
          {isGenerating
            ? "Your morning brief is being generated."
            : isFailed
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
