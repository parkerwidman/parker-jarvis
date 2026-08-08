import {
  MORNING_BRIEF_AUDIO_TIMELINE_VERSION,
  type MorningBriefAudioTimeline,
  type MorningBriefSentenceTiming,
  type WordTimestamp,
} from "@/lib/jarvis/briefings/audio-timeline-types";
import {
  alignmentTokensMatch,
  tokenizeSentenceWords,
} from "@/lib/jarvis/briefings/normalize-word-for-alignment";
import { segmentMorningBriefSentences } from "@/lib/jarvis/briefings/segment-morning-brief-sentences";

const ALIGNMENT_LOOKAHEAD = 6;
const MIN_ALIGNMENT_COVERAGE = 0.75;
const DURATION_TOLERANCE_MS = 250;

type SentenceWordRef = {
  sentenceIndex: number;
  wordIndex: number;
  displayWord: string;
};

type SentenceRange = {
  startWordIndex: number;
  endWordIndex: number;
};

export type AlignSentenceTimingsResult =
  | {
      success: true;
      timeline: MorningBriefAudioTimeline;
      durationMs: number;
    }
  | { success: false; reason: "alignment_failed" | "invalid_timestamps" };

function flattenSentenceWords(sentences: string[]): SentenceWordRef[] {
  const refs: SentenceWordRef[] = [];

  sentences.forEach((sentence, sentenceIndex) => {
    tokenizeSentenceWords(sentence).forEach((displayWord, wordIndex) => {
      refs.push({ sentenceIndex, wordIndex, displayWord });
    });
  });

  return refs;
}

function alignKnownWordsToTranscription(
  knownWords: SentenceWordRef[],
  transcribedWords: WordTimestamp[],
): Map<number, SentenceRange> | null {
  let transcribedIndex = 0;
  const sentenceRanges = new Map<number, SentenceRange>();
  let matchedKnownCount = 0;

  for (const knownWord of knownWords) {
    let matched = false;

    for (
      let candidate = transcribedIndex;
      candidate < Math.min(transcribedIndex + ALIGNMENT_LOOKAHEAD, transcribedWords.length);
      candidate += 1
    ) {
      if (
        alignmentTokensMatch(
          knownWord.displayWord,
          transcribedWords[candidate].word,
        )
      ) {
        const existing = sentenceRanges.get(knownWord.sentenceIndex);

        if (!existing) {
          sentenceRanges.set(knownWord.sentenceIndex, {
            startWordIndex: candidate,
            endWordIndex: candidate,
          });
        } else {
          existing.endWordIndex = candidate;
        }

        transcribedIndex = candidate + 1;
        matchedKnownCount += 1;
        matched = true;
        break;
      }
    }

    if (!matched) {
      return null;
    }
  }

  if (knownWords.length === 0) {
    return null;
  }

  const coverage = matchedKnownCount / knownWords.length;

  if (coverage < MIN_ALIGNMENT_COVERAGE) {
    return null;
  }

  if (sentenceRanges.size !== new Set(knownWords.map((word) => word.sentenceIndex)).size) {
    return null;
  }

  return sentenceRanges;
}

function buildSentenceTimings(
  sentences: string[],
  transcribedWords: WordTimestamp[],
  sentenceRanges: Map<number, SentenceRange>,
  durationMs: number,
): MorningBriefSentenceTiming[] | null {
  const timings: MorningBriefSentenceTiming[] = [];
  let previousEndMs = -1;

  for (let index = 0; index < sentences.length; index += 1) {
    const range = sentenceRanges.get(index);

    if (!range) {
      return null;
    }

    const startWord = transcribedWords[range.startWordIndex];
    const endWord = transcribedWords[range.endWordIndex];
    const startMs = Math.round(startWord.start * 1000);
    const endMs = Math.round(endWord.end * 1000);

    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      startMs < 0 ||
      endMs < startMs ||
      startMs < previousEndMs
    ) {
      return null;
    }

    if (endMs > durationMs + DURATION_TOLERANCE_MS) {
      return null;
    }

    timings.push({
      index,
      text: sentences[index],
      startMs,
      endMs,
    });

    previousEndMs = endMs;
  }

  return timings;
}

export function alignSentenceTimings(
  spokenContent: string,
  transcribedWords: WordTimestamp[],
  durationSeconds: number,
): AlignSentenceTimingsResult {
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    transcribedWords.length === 0
  ) {
    return { success: false, reason: "invalid_timestamps" };
  }

  for (const word of transcribedWords) {
    if (
      !Number.isFinite(word.start) ||
      !Number.isFinite(word.end) ||
      word.start < 0 ||
      word.end < word.start
    ) {
      return { success: false, reason: "invalid_timestamps" };
    }
  }

  for (let index = 1; index < transcribedWords.length; index += 1) {
    if (transcribedWords[index].start < transcribedWords[index - 1].start) {
      return { success: false, reason: "invalid_timestamps" };
    }
  }

  const sentences = segmentMorningBriefSentences(spokenContent);

  if (sentences.length === 0) {
    return { success: false, reason: "alignment_failed" };
  }

  const knownWords = flattenSentenceWords(sentences);
  const sentenceRanges = alignKnownWordsToTranscription(
    knownWords,
    transcribedWords,
  );

  if (!sentenceRanges) {
    return { success: false, reason: "alignment_failed" };
  }

  const durationMs = Math.round(durationSeconds * 1000);
  const sentenceTimings = buildSentenceTimings(
    sentences,
    transcribedWords,
    sentenceRanges,
    durationMs,
  );

  if (!sentenceTimings || sentenceTimings.length !== sentences.length) {
    return { success: false, reason: "alignment_failed" };
  }

  return {
    success: true,
    timeline: {
      version: MORNING_BRIEF_AUDIO_TIMELINE_VERSION,
      sentences: sentenceTimings,
    },
    durationMs,
  };
}

export function reconstructSpokenContentFromSentences(
  sentences: MorningBriefSentenceTiming[],
): string {
  return sentences
    .slice()
    .sort((left, right) => left.index - right.index)
    .map((sentence) => sentence.text)
    .join(" ");
}
