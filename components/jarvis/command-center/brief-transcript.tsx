"use client";

import {
  buildBriefTranscriptSegments,
  type BriefTranscriptSegment,
} from "@/lib/jarvis/briefings/format-brief-transcript";
import { normalizeMorningBriefSpokenText } from "@/lib/jarvis/briefings/morning-brief-structure";

type BriefTranscriptProps = {
  transcript: string;
  priorityText: string | null;
  open: boolean;
};

export function BriefTranscript({
  transcript,
  priorityText,
  open,
}: BriefTranscriptProps) {
  const spokenText = normalizeMorningBriefSpokenText(transcript);
  const segments = buildBriefTranscriptSegments(spokenText, priorityText);

  return (
    <div
      className={`cc2-transcript${open ? "" : " cc2-transcript--collapsed"}`}
      aria-hidden={!open}
    >
      <BriefTranscriptBody segments={segments} />
    </div>
  );
}

function BriefTranscriptBody({
  segments,
}: {
  segments: BriefTranscriptSegment[];
}) {
  return (
    <p className="cc2-transcript-body">
      {segments.map((segment, index) =>
        segment.emphasized ? (
          <span key={`${index}-${segment.text}`} className="cc2-transcript-em">
            {segment.text}
          </span>
        ) : (
          <span key={`${index}-${segment.text}`}>{segment.text}</span>
        ),
      )}
    </p>
  );
}
