import { describe, expect, it } from "vitest";

import type { Memory } from "@/lib/jarvis/tools/memory-tools";
import { selectRelevantMemories } from "@/lib/jarvis/context-engine/memory-relevance-bridge";

describe("existing memory relevance bridge", () => {
  const memories: Memory[] = [
    {
      id: "1",
      category: "business",
      content: "Melusi launch prep is the top business priority.",
      importance: 4,
      confirmed_by_user: true,
      created_at: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "2",
      category: "other",
      content: "Parker plays poker on Friday nights.",
      importance: 3,
      confirmed_by_user: false,
      created_at: "2026-08-02T00:00:00.000Z",
    },
    {
      id: "3",
      category: "preference",
      content: "Prefers concise answers.",
      importance: 5,
      confirmed_by_user: true,
      created_at: "2026-08-03T00:00:00.000Z",
    },
  ];

  it("favors Melusi-related memory for a Melusi question", () => {
    const { selected } = selectRelevantMemories({
      memories,
      currentMessage: "What should I focus on for Melusi this week?",
      rollingSummary: "",
      activeEntities: [{ type: "project", name: "Melusi" }],
    });

    expect(selected.some((memory) => memory.content.includes("Melusi"))).toBe(true);
    expect(selected.some((memory) => memory.content.includes("poker"))).toBe(false);
  });

  it("boosts confirmed and important memories in fallback mode", () => {
    const { selected } = selectRelevantMemories({
      memories,
      currentMessage: "hello",
      rollingSummary: "",
      activeEntities: [],
      maxCount: 2,
    });

    expect(selected.length).toBeLessThanOrEqual(2);
    expect(selected[0]?.confirmed_by_user || selected[0]?.importance).toBeTruthy();
  });

  it("enforces a maximum injected memory count", () => {
    const manyMemories = Array.from({ length: 30 }, (_, index) => ({
      id: `${index}`,
      category: "context",
      content: `Melusi note ${index}`,
      importance: 3,
      confirmed_by_user: false,
      created_at: "2026-08-01T00:00:00.000Z",
    }));

    const { selected } = selectRelevantMemories({
      memories: manyMemories,
      currentMessage: "Melusi update",
      rollingSummary: "",
      activeEntities: [],
      maxCount: 8,
    });

    expect(selected.length).toBeLessThanOrEqual(8);
  });
});
