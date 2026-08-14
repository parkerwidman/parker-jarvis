import { describe, expect, it } from "vitest";

import {
  auditMainInstructionModules,
  estimateCoreInstructionTokens,
} from "@/lib/jarvis/agents/instruction-token-audit";
import { getToolsForAgent } from "@/lib/jarvis/agents/tool-definitions";
import { rankToolSchemasBySize } from "@/lib/jarvis/agents/tool-domains";
import { resolveMainJarvisToolExposure } from "@/lib/jarvis/agents/dynamic-tool-exposure";
import { estimateToolSchemaTokens } from "@/lib/jarvis/performance/model-usage";

describe("instruction and schema token audit", () => {
  it("reports core instruction module breakdown", () => {
    const modules = auditMainInstructionModules();

    expect(modules).toHaveLength(2);
    expect(estimateCoreInstructionTokens()).toBeGreaterThan(6000);
    expect(modules[0]?.module).toBe("BASE_MAIN_JARVIS_INSTRUCTIONS");
    expect(modules[1]?.module).toBe("MAIN_JARVIS_RESPONSE_PRESENTATION");
    expect(modules[1]?.estimatedTokens).toBeLessThan(700);
  });

  it("ranks the largest tool schemas first", () => {
    const ranked = rankToolSchemasBySize(getToolsForAgent("main"));

    expect(ranked[0]?.estimatedTokens ?? 0).toBeGreaterThan(200);
    expect(ranked.at(-1)?.estimatedTokens ?? 0).toBeGreaterThan(0);
  });

  it("shows dynamic exposure reduces schema tokens for general and schedule requests", () => {
    const allTools = getToolsForAgent("main");
    const generalTools = resolveMainJarvisToolExposure({
      message: "Explain compound interest in three sentences.",
      confirmationIntent: "unknown",
      pendingAction: null,
      contextTarget: null,
    }).tools;
    const scheduleTools = resolveMainJarvisToolExposure({
      message: "What does my day tomorrow look like?",
      confirmationIntent: "unknown",
      pendingAction: null,
      contextTarget: null,
    }).tools;

    expect(estimateToolSchemaTokens(allTools)).toBeGreaterThan(8000);
    expect(estimateToolSchemaTokens(generalTools)).toBe(0);
    expect(estimateToolSchemaTokens(scheduleTools)).toBeLessThan(
      estimateToolSchemaTokens(allTools) / 2,
    );
  });
});
