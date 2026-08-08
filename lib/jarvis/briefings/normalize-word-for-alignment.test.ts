import { describe, expect, it } from "vitest";

import {
  alignmentTokensMatch,
  normalizeApostrophes,
  normalizeWordForAlignment,
} from "@/lib/jarvis/briefings/normalize-word-for-alignment";

describe("normalizeWordForAlignment", () => {
  it("lowercases and strips surrounding punctuation", () => {
    expect(normalizeWordForAlignment('"Hello,"')).toBe("hello");
    expect(normalizeWordForAlignment("(proposal)")).toBe("proposal");
  });

  it("normalizes apostrophe variants", () => {
    expect(normalizeApostrophes("nothing`s")).toBe("nothing's");
    expect(normalizeWordForAlignment("nothing`s")).toBe("nothing's");
  });

  it("maps simple number words to digits for matching", () => {
    expect(normalizeWordForAlignment("two")).toBe("2");
    expect(normalizeWordForAlignment("2")).toBe("2");
    expect(alignmentTokensMatch("2", "two")).toBe(true);
    expect(alignmentTokensMatch("two", "2")).toBe(true);
  });

  it("allows mild transcription typos for longer words", () => {
    expect(alignmentTokensMatch("proposal", "proposol")).toBe(true);
    expect(alignmentTokensMatch("cat", "car")).toBe(false);
  });
});
