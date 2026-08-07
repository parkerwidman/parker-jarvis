export type BriefTranscriptSegment = {
  text: string;
  emphasized: boolean;
};

export type BriefTranscriptEmphasisRange = {
  start: number;
  end: number;
};

export const BRIEF_TRANSCRIPT_MAX_EMPHASIS_RANGES = 1;

const LEADING_VERB_PREFIXES = [
  "figure out ",
  "decide whether to ",
  "decide if ",
  "work on ",
  "review ",
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildPriorityPhraseMatchCandidates(priorityText: string): string[] {
  const trimmed = priorityText.trim();
  const candidates = new Set<string>([trimmed]);

  for (const prefix of LEADING_VERB_PREFIXES) {
    const lower = trimmed.toLowerCase();
    const prefixLower = prefix.toLowerCase();

    if (lower.startsWith(prefixLower)) {
      candidates.add(trimmed.slice(prefix.length).trim());
    } else {
      candidates.add(`${prefix}${trimmed}`);
    }
  }

  return [...candidates]
    .filter((candidate) => candidate.length >= 3)
    .sort((a, b) => b.length - a.length);
}

export function findFirstPriorityPhraseRange(
  transcript: string,
  phrase: string,
): BriefTranscriptEmphasisRange | null {
  const normalizedTranscript = transcript.trim();
  const normalizedPhrase = phrase.trim();

  if (!normalizedTranscript || !normalizedPhrase) {
    return null;
  }

  const escapedPhrase = escapeRegExp(normalizedPhrase);
  const prefix = /^\w/.test(normalizedPhrase) ? "(?<!\\w)" : "";
  const suffix = /\w$/.test(normalizedPhrase) ? "(?!\\w)" : "";
  const matcher = new RegExp(`${prefix}${escapedPhrase}${suffix}`, "i");
  const match = matcher.exec(normalizedTranscript);

  if (!match) {
    return null;
  }

  return {
    start: match.index,
    end: match.index + match[0].length,
  };
}

export function findPriorityPhraseRangeWithFallback(
  transcript: string,
  priorityText: string,
): BriefTranscriptEmphasisRange | null {
  for (const candidate of buildPriorityPhraseMatchCandidates(priorityText)) {
    const range = findFirstPriorityPhraseRange(transcript, candidate);

    if (range) {
      return range;
    }
  }

  return null;
}

export function selectBriefTranscriptEmphasisRanges(
  transcript: string,
  priorityText: string | null | undefined,
): BriefTranscriptEmphasisRange[] {
  const normalizedPriority = priorityText?.trim();

  if (!normalizedPriority) {
    return [];
  }

  const range = findPriorityPhraseRangeWithFallback(transcript, normalizedPriority);

  return range ? [range] : [];
}

export function buildBriefTranscriptSegments(
  transcript: string,
  priorityText: string | null | undefined,
): BriefTranscriptSegment[] {
  const normalizedTranscript = transcript.trim();

  if (!normalizedTranscript) {
    return [];
  }

  const ranges = selectBriefTranscriptEmphasisRanges(
    normalizedTranscript,
    priorityText,
  );

  if (ranges.length === 0) {
    return [{ text: normalizedTranscript, emphasized: false }];
  }

  const range = ranges[0];
  const segments: BriefTranscriptSegment[] = [];

  if (range.start > 0) {
    segments.push({
      text: normalizedTranscript.slice(0, range.start),
      emphasized: false,
    });
  }

  segments.push({
    text: normalizedTranscript.slice(range.start, range.end),
    emphasized: true,
  });

  if (range.end < normalizedTranscript.length) {
    segments.push({
      text: normalizedTranscript.slice(range.end),
      emphasized: false,
    });
  }

  return segments;
}

export function transcriptSegmentsContainHtml(
  segments: BriefTranscriptSegment[],
): boolean {
  return segments.some((segment) => /<\/?[a-z][\s\S]*>/i.test(segment.text));
}

export function emphasizedTranscriptText(segments: BriefTranscriptSegment[]): string {
  return segments.map((segment) => segment.text).join("");
}
