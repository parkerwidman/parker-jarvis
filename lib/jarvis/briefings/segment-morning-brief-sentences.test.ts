import { describe, expect, it } from "vitest";

import { segmentMorningBriefSentences } from "@/lib/jarvis/briefings/segment-morning-brief-sentences";

describe("segmentMorningBriefSentences", () => {
  it("preserves canonical display text across sentence boundaries", () => {
    const content =
      "Good morning, Parker. Your top priority is finishing the proposal. On Melusi, 2 leads have been waiting over a day.";

    expect(segmentMorningBriefSentences(content)).toEqual([
      "Good morning, Parker.",
      "Your top priority is finishing the proposal.",
      "On Melusi, 2 leads have been waiting over a day.",
    ]);
  });

  it("keeps contractions intact", () => {
    const content = "On personal, nothing's overdue. Your next deadline is 6 days out.";

    expect(segmentMorningBriefSentences(content)).toEqual([
      "On personal, nothing's overdue.",
      "Your next deadline is 6 days out.",
    ]);
  });

  it("does not split decimal numbers", () => {
    const content = "Growth is up 2.5 percent today. Content posting is still 0 of 4.";

    expect(segmentMorningBriefSentences(content)).toEqual([
      "Growth is up 2.5 percent today.",
      "Content posting is still 0 of 4.",
    ]);
  });

  it("normalizes whitespace consistently", () => {
    const content = "Two things stand out today.   On Melusi, 2 leads have been waiting.";

    expect(segmentMorningBriefSentences(content)).toEqual([
      "Two things stand out today.",
      "On Melusi, 2 leads have been waiting.",
    ]);
  });

  it("returns no empty sentences", () => {
    expect(segmentMorningBriefSentences("   ")).toEqual([]);
    expect(segmentMorningBriefSentences("Only one sentence here.")).toEqual([
      "Only one sentence here.",
    ]);
  });

  it("reconstructs the original normalized content when joined", () => {
    const content =
      "Two things stand out today. On Melusi, 2 leads have been waiting over a day. Suggest Melusi mode.";

    const sentences = segmentMorningBriefSentences(content);

    expect(sentences.join(" ")).toBe(content);
  });
});
