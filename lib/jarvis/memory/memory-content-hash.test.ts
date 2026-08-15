import { describe, expect, it } from "vitest";

import {
  buildMemoryEmbeddingInput,
  computeMemoryContentHash,
  normalizeMemoryTextForEmbedding,
} from "@/lib/jarvis/memory/memory-content-hash";

describe("memory content hash", () => {
  it("normalizes whitespace before hashing", () => {
    const first = computeMemoryContentHash({
      category: "preference",
      content: "  I prefer   Thursday launches.  ",
    });
    const second = computeMemoryContentHash({
      category: "preference",
      content: "I prefer Thursday launches.",
    });

    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it("includes category in embedding input", () => {
    expect(
      buildMemoryEmbeddingInput({
        category: "Preference",
        content: "Quiet travel",
      }),
    ).toBe("[preference] Quiet travel");

    expect(normalizeMemoryTextForEmbedding("a   b")).toBe("a b");
  });

  it("changes hash when content changes", () => {
    const before = computeMemoryContentHash({
      category: "preference",
      content: "Thursday launches",
    });
    const after = computeMemoryContentHash({
      category: "preference",
      content: "Friday launches",
    });

    expect(before).not.toBe(after);
  });
});
