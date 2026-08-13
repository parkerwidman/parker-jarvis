import { describe, expect, it } from "vitest";

import { buildAgentInstructions } from "@/lib/jarvis/agents/instruction-builder";
import { applyGlobalOptionalBudget, buildMainInstructions } from "@/lib/jarvis/context-engine/context-formatters";
import { estimateLegacyMainContextTokens } from "@/lib/jarvis/context-engine/context-engine";
import { estimateTokens, TOTAL_OPTIONAL_CONTEXT_TOKEN_BUDGET } from "@/lib/jarvis/context-engine/context-budget";
import type { JarvisContext } from "@/lib/jarvis/tools/memory-tools";

const sampleContext: JarvisContext = {
  profile: {
    user_id: "user",
    preferred_name: "Parker",
    timezone: "America/Chicago",
    communication_style: "Direct",
    current_focus: "Melusi launch",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  lifeAreas: [{ id: "1", name: "Business", active: true, created_at: "2026-01-01T00:00:00.000Z" }],
  goals: Array.from({ length: 12 }, (_, index) => ({
    id: `${index}`,
    title: `Goal ${index}`,
    description: "Long goal description ".repeat(8),
    success_definition: null,
    status: "active",
    priority: index % 3 === 0 ? "high" : "medium",
    progress: 0,
    target_date: null,
    life_area_id: "1",
    created_at: "2026-01-01T00:00:00.000Z",
  })),
  memories: Array.from({ length: 50 }, (_, index) => ({
    id: `${index}`,
    category: "context",
    content: `Memory ${index} `.repeat(20),
    importance: 3,
    confirmed_by_user: index % 5 === 0,
    created_at: "2026-01-01T00:00:00.000Z",
  })),
};

const conversationInput = [
  { role: "user" as const, content: "What should I focus on for Melusi?" },
  { role: "assistant" as const, content: "Launch prep and outreach." },
  { role: "user" as const, content: "Why?" },
];

describe("context size comparison fixture", () => {
  it("reports exact representative estimated token counts", () => {
    const legacyInstructions = buildAgentInstructions("main", sampleContext);
    const boundedInstructions = buildMainInstructions({
      jarvisContext: sampleContext,
      conversationState: null,
      selectedRecordSection: "",
      pendingScheduleSection: "",
      selectedGoals: sampleContext.goals.slice(0, 8),
      selectedMemories: sampleContext.memories.slice(0, 8),
      activeEntities: [],
      sectionsTrimmed: [],
    });

    const legacyTotal = estimateLegacyMainContextTokens({
      instructions: legacyInstructions,
      conversationInput,
    });

    const boundedTotal = estimateLegacyMainContextTokens({
      instructions: boundedInstructions,
      conversationInput,
    });

    const reduction = ((legacyTotal - boundedTotal) / legacyTotal) * 100;

    const fixtureNumbers = {
      legacyEstimatedTokens: legacyTotal,
      j82EstimatedTokens: boundedTotal,
      reductionPercent: Number(reduction.toFixed(1)),
      legacyInstructionTokens: estimateTokens(legacyInstructions),
      j82InstructionTokens: estimateTokens(boundedInstructions),
      conversationInputTokens: conversationInput.reduce(
        (total, message) => total + estimateTokens(message.content),
        0,
      ),
      memoriesConsidered: 50,
      memoriesInjected: 8,
      goalsInjected: 8,
    };

    expect(fixtureNumbers.legacyEstimatedTokens).toBeGreaterThan(
      fixtureNumbers.j82EstimatedTokens,
    );
    expect(fixtureNumbers.reductionPercent).toBeGreaterThan(20);
  });

  it("enforces a global optional context budget when all sections are large", () => {
    const sectionsTrimmed: string[] = [];
    const trimmed = applyGlobalOptionalBudget({
      workingStateSection: "x".repeat(20000),
      selectedRecordSection: "y".repeat(20000),
      personalContextSection: "z".repeat(20000),
      sectionsTrimmed,
    });

    const totalOptional =
      estimateTokens(trimmed.workingStateSection) +
      estimateTokens(trimmed.selectedRecordSection) +
      estimateTokens(trimmed.personalContextSection);

    expect(totalOptional).toBeLessThanOrEqual(TOTAL_OPTIONAL_CONTEXT_TOKEN_BUDGET + 200);
    expect(sectionsTrimmed.length).toBeGreaterThan(0);
  });
});
