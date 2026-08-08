import { describe, expect, it } from "vitest";

import { alignSentenceTimings } from "@/lib/jarvis/briefings/align-sentence-timings";
import type { WordTimestamp } from "@/lib/jarvis/briefings/audio-timeline-types";

function buildWords(entries: Array<[string, number, number]>): WordTimestamp[] {
  return entries.map(([word, start, end]) => ({ word, start, end }));
}

describe("alignSentenceTimings", () => {
  const spokenContent =
    "Good morning, Parker. Your top priority is finishing the proposal.";

  const cleanWords = buildWords([
    ["Good", 0.0, 0.2],
    ["morning", 0.2, 0.5],
    ["Parker", 0.5, 0.9],
    ["Your", 1.0, 1.2],
    ["top", 1.2, 1.4],
    ["priority", 1.4, 1.8],
    ["is", 1.8, 1.9],
    ["finishing", 1.9, 2.3],
    ["the", 2.3, 2.4],
    ["proposal", 2.4, 2.9],
  ]);

  it("aligns clean transcripts with monotonic sentence timings", () => {
    const result = alignSentenceTimings(spokenContent, cleanWords, 3.0);

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.timeline.sentences).toEqual([
      {
        index: 0,
        text: "Good morning, Parker.",
        startMs: 0,
        endMs: 900,
      },
      {
        index: 1,
        text: "Your top priority is finishing the proposal.",
        startMs: 1000,
        endMs: 2900,
      },
    ]);
  });

  it("uses actual word timestamps rather than fabricated durations", () => {
    const result = alignSentenceTimings(spokenContent, cleanWords, 3.0);

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.timeline.sentences[0].startMs).toBe(
      Math.round(cleanWords[0].start * 1000),
    );
    expect(result.timeline.sentences[1].endMs).toBe(
      Math.round(cleanWords[cleanWords.length - 1].end * 1000),
    );
  });

  it("still aligns with mild transcription mismatch", () => {
    const mismatchedWords = buildWords([
      ["Good", 0.0, 0.2],
      ["morning", 0.2, 0.5],
      ["Parker", 0.5, 0.9],
      ["Your", 1.0, 1.2],
      ["top", 1.2, 1.4],
      ["priority", 1.4, 1.8],
      ["is", 1.8, 1.9],
      ["finishing", 1.9, 2.3],
      ["the", 2.3, 2.4],
      ["proposol", 2.4, 2.9],
    ]);

    const result = alignSentenceTimings(spokenContent, mismatchedWords, 3.0);

    expect(result.success).toBe(true);
  });

  it("maps spoken digits to transcribed number words", () => {
    const content = "On Melusi, 2 leads have been waiting.";
    const words = buildWords([
      ["On", 0.0, 0.1],
      ["Melusi", 0.1, 0.4],
      ["two", 0.4, 0.5],
      ["leads", 0.5, 0.8],
      ["have", 0.8, 0.9],
      ["been", 0.9, 1.1],
      ["waiting", 1.1, 1.5],
    ]);

    const result = alignSentenceTimings(content, words, 1.6);

    expect(result.success).toBe(true);
  });

  it("fails instead of inventing timing when alignment is poor", () => {
    const badWords = buildWords([
      ["Hello", 0.0, 0.2],
      ["world", 0.2, 0.5],
    ]);

    const result = alignSentenceTimings(spokenContent, badWords, 1.0);

    expect(result.success).toBe(false);
  });

  it("keeps sentence end within audio duration tolerance", () => {
    const result = alignSentenceTimings(spokenContent, cleanWords, 3.0);

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    const lastSentence =
      result.timeline.sentences[result.timeline.sentences.length - 1];

    expect(lastSentence.endMs).toBeLessThanOrEqual(result.durationMs + 250);
  });
});
