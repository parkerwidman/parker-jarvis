import type OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  JarvisRequestUsageCollector,
  aggregateForegroundTotals,
  buildContextCompositionEstimates,
  buildFastPathUsageMetadata,
  buildJarvisRequestUsageMetadata,
  estimateToolResultTokens,
  estimateToolSchemaTokens,
  extractConversationSummaryUsage,
  extractModelRoundUsage,
  getConversationSummaryTriggerCount,
  isJarvisUsageLogsEnabled,
  logConversationSummaryUsage,
  recordConversationSummaryTrigger,
  resetConversationSummaryTriggerCount,
  resetSummaryUsageDedupeForTests,
} from "@/lib/jarvis/performance/model-usage";
import { resolveMainJarvisToolExposure } from "@/lib/jarvis/agents/dynamic-tool-exposure";

function mockResponse(
  overrides: Partial<OpenAI.Responses.Response> & {
    usage?: OpenAI.Responses.ResponseUsage | null;
  },
): OpenAI.Responses.Response {
  return {
    id: overrides.id ?? "resp_test",
    model: overrides.model ?? "gpt-5",
    output: overrides.output ?? [],
    usage: overrides.usage ?? undefined,
    ...overrides,
  } as OpenAI.Responses.Response;
}

function fullUsage(
  overrides: Partial<OpenAI.Responses.ResponseUsage> = {},
): OpenAI.Responses.ResponseUsage {
  return {
    input_tokens: 1000,
    input_tokens_details: {
      cached_tokens: 400,
      cache_write_tokens: 0,
    },
    output_tokens: 200,
    output_tokens_details: {
      reasoning_tokens: 80,
    },
    total_tokens: 1200,
    ...overrides,
  };
}

describe("model usage extraction", () => {
  afterEach(() => {
    delete process.env.JARVIS_USAGE_LOGS;
    resetConversationSummaryTriggerCount();
    resetSummaryUsageDedupeForTests();
  });

  it("extracts one tool-free round usage", () => {
    const usage = extractModelRoundUsage(
      mockResponse({ usage: fullUsage() }),
      1,
      42,
    );

    expect(usage).toEqual({
      round: 1,
      model: "gpt-5",
      inputTokens: 1000,
      cachedInputTokens: 400,
      uncachedInputTokens: 600,
      outputTokens: 200,
      reasoningTokens: 80,
      totalTokens: 1200,
      toolsExposedCount: 42,
    });
  });

  it("aggregates two model rounds correctly", () => {
    const rounds = [
      extractModelRoundUsage(
        mockResponse({ id: "r1", usage: fullUsage({ input_tokens: 1000, total_tokens: 1200 }) }),
        1,
        10,
      )!,
      extractModelRoundUsage(
        mockResponse({ id: "r2", usage: fullUsage({ input_tokens: 2000, total_tokens: 2200 }) }),
        2,
        10,
        500,
      )!,
    ];

    const totals = aggregateForegroundTotals(rounds, 5200);

    expect(totals.totalInputTokens).toBe(3000);
    expect(totals.totalCachedInputTokens).toBe(800);
    expect(totals.totalUncachedInputTokens).toBe(2200);
    expect(totals.totalOutputTokens).toBe(400);
    expect(totals.totalReasoningTokens).toBe(160);
    expect(totals.totalTokens).toBe(3400);
    expect(totals.estimatedToolSchemaTokens).toBe(5200);
    expect(totals.estimatedToolResultTokens).toBe(500);
  });

  it("aggregates five model rounds correctly", () => {
    const rounds = Array.from({ length: 5 }, (_, index) =>
      extractModelRoundUsage(
        mockResponse({
          id: `round-${index + 1}`,
          usage: fullUsage({
            input_tokens: 1000 + index * 100,
            output_tokens: 100 + index * 10,
            total_tokens: 1100 + index * 110,
          }),
        }),
        index + 1,
        8,
        index > 0 ? 200 : undefined,
      )!,
    );

    const totals = aggregateForegroundTotals(rounds, 3000);

    expect(rounds).toHaveLength(5);
    expect(totals.totalInputTokens).toBe(6000);
    expect(totals.totalOutputTokens).toBe(600);
    expect(totals.totalTokens).toBe(6600);
    expect(totals.estimatedToolResultTokens).toBe(800);
  });

  it("counts streamed response usage once via collector dedupe", () => {
    const collector = new JarvisRequestUsageCollector("req-stream", "main");
    collector.setMetadata({
      toolsExposedCount: 12,
      contextComposition: buildContextCompositionEstimates({ tools: [] }),
    });

    const response = mockResponse({ id: "same-response", usage: fullUsage() });

    expect(collector.recordModelRound(response, 1)).not.toBeNull();
    expect(collector.recordModelRound(response, 1)).toBeNull();

    const snapshot = collector.snapshot();
    expect(snapshot.modelRoundCount).toBe(1);
    expect(snapshot.foregroundTotals.totalTokens).toBe(1200);
  });

  it("counts blocking response usage once", () => {
    const collector = new JarvisRequestUsageCollector("req-block", "main");
    collector.setMetadata({
      toolsExposedCount: 5,
      contextComposition: buildContextCompositionEstimates({ tools: [] }),
    });

    collector.recordModelRound(
      mockResponse({ id: "blocking-1", usage: fullUsage() }),
      1,
    );
    collector.recordModelRound(
      mockResponse({ id: "blocking-2", usage: fullUsage({ total_tokens: 900 }) }),
      2,
    );

    expect(collector.snapshot().modelRoundCount).toBe(2);
  });

  it("extracts cached tokens when present", () => {
    const usage = extractModelRoundUsage(
      mockResponse({ usage: fullUsage({ input_tokens: 5000, input_tokens_details: { cached_tokens: 3000, cache_write_tokens: 0 } }) }),
      1,
      1,
    );

    expect(usage?.cachedInputTokens).toBe(3000);
    expect(usage?.uncachedInputTokens).toBe(2000);
  });

  it("handles missing cached details safely", () => {
    const usage = extractModelRoundUsage(
      mockResponse({
        usage: {
          input_tokens: 5000,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          output_tokens: 100,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 5100,
        },
      }),
      1,
      1,
    );

    expect(usage?.cachedInputTokens).toBe(0);
    expect(usage?.uncachedInputTokens).toBe(5000);
  });

  it("extracts reasoning tokens when present", () => {
    const usage = extractModelRoundUsage(
      mockResponse({
        usage: fullUsage({ output_tokens_details: { reasoning_tokens: 420 } }),
      }),
      1,
      1,
    );

    expect(usage?.reasoningTokens).toBe(420);
  });

  it("handles missing reasoning details safely", () => {
    const usage = extractModelRoundUsage(
      mockResponse({
        usage: {
          input_tokens: 100,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          output_tokens: 50,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 150,
        },
      }),
      1,
      1,
    );

    expect(usage?.reasoningTokens).toBe(0);
  });

  it("aggregates total request usage with tool counts", () => {
    const collector = new JarvisRequestUsageCollector("req-total", "main");
    collector.setMetadata({
      toolsExposedCount: 42,
      contextComposition: buildContextCompositionEstimates({
        tools: [{ type: "function", name: "test", parameters: {}, strict: false }],
      }),
    });
    collector.toolCallCount = 3;
    collector.toolRoundCount = 2;

    collector.recordModelRound(
      mockResponse({ id: "a", usage: fullUsage({ total_tokens: 1000 }) }),
      1,
      800,
    );
    collector.recordModelRound(
      mockResponse({ id: "b", usage: fullUsage({ total_tokens: 2000 }) }),
      2,
      1200,
    );
    collector.recordModelRound(
      mockResponse({ id: "c", usage: fullUsage({ total_tokens: 1500 }) }),
      3,
    );

    const snapshot = collector.snapshot();

    expect(snapshot.modelRoundCount).toBe(3);
    expect(snapshot.toolCallCount).toBe(3);
    expect(snapshot.toolRoundCount).toBe(2);
    expect(snapshot.toolsExposedCount).toBe(42);
    expect(snapshot.foregroundTotals.totalTokens).toBe(4500);
    expect(snapshot.foregroundTotals.estimatedToolResultTokens).toBe(2000);
  });

  it("records toolsExposedCount on each round", () => {
    const collector = new JarvisRequestUsageCollector("req-tools", "main");
    collector.setMetadata({
      toolsExposedCount: 37,
      contextComposition: buildContextCompositionEstimates({ tools: [] }),
    });

    const round = collector.recordModelRound(
      mockResponse({ usage: fullUsage() }),
      1,
    );

    expect(round?.toolsExposedCount).toBe(37);
  });

  it("estimates tool schema tokens", () => {
    const tools = [
      {
        type: "function" as const,
        name: "get_schedule",
        description: "Read schedule",
        parameters: { type: "object", properties: {} },
        strict: false,
      },
    ];

    expect(estimateToolSchemaTokens(tools)).toBeGreaterThan(0);
  });

  it("estimates tool result tokens", () => {
    expect(
      estimateToolResultTokens([
        '{"events":[{"title":"Meeting"}]}',
        '{"tasks":[]}',
      ]),
    ).toBeGreaterThan(0);
  });

  it("separates summary usage from foreground", () => {
    const summary = extractConversationSummaryUsage(
      mockResponse({ id: "summary-1", usage: fullUsage({ total_tokens: 777 }) }),
      "conv-123",
      true,
    );

    expect(summary?.category).toBe("conversation_summary");
    expect(summary?.conversationId).toBe("conv-123");
    expect(summary?.totalTokens).toBe(777);
  });

  it("counts summary usage once", () => {
    const response = mockResponse({ id: "summary-dedupe", usage: fullUsage() });

    expect(
      extractConversationSummaryUsage(response, "conv-1", true),
    ).not.toBeNull();
    expect(
      extractConversationSummaryUsage(response, "conv-1", true),
    ).toBeNull();
  });

  it("tracks summary trigger count", () => {
    resetConversationSummaryTriggerCount();
    recordConversationSummaryTrigger();
    recordConversationSummaryTrigger();

    expect(getConversationSummaryTriggerCount()).toBe(2);
  });

  it("does not print private text in usage logs", () => {
    process.env.JARVIS_USAGE_LOGS = "1";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const collector = new JarvisRequestUsageCollector("req-privacy", "main");
    collector.setMetadata({
      toolsExposedCount: 1,
      contextComposition: buildContextCompositionEstimates({ tools: [] }),
    });
    collector.recordModelRound(
      mockResponse({ usage: fullUsage() }),
      1,
    );
    collector.logIfEnabled();

    logConversationSummaryUsage({
      category: "conversation_summary",
      conversationId: "conv-private",
      model: "gpt-5",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      success: true,
    });

    const output = logSpy.mock.calls.flat().join(" ");
    expect(output).not.toContain("password");
    expect(output).not.toContain("secret");
    expect(output).toContain("[JARVIS_USAGE]");
    expect(output).toContain("[JARVIS_USAGE_SUMMARY]");

    logSpy.mockRestore();
  });

  it("respects JARVIS_USAGE_LOGS flag", () => {
    delete process.env.JARVIS_USAGE_LOGS;
    expect(isJarvisUsageLogsEnabled()).toBe(false);

    process.env.JARVIS_USAGE_LOGS = "1";
    expect(isJarvisUsageLogsEnabled()).toBe(true);
  });

  it("logs read fast path usage with one model round and prefetched tool results", () => {
    process.env.JARVIS_USAGE_LOGS = "1";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const planningExposure = resolveMainJarvisToolExposure({
      message: "What should I focus on tomorrow?",
      confirmationIntent: "unknown",
      pendingAction: null,
      contextTarget: null,
    });
    const prepared = buildJarvisRequestUsageMetadata({
      tools: planningExposure.tools,
      toolRoutingReason: planningExposure.routingReason,
    });
    const collector = new JarvisRequestUsageCollector("req-fast", "main");
    collector.setMetadata(
      buildFastPathUsageMetadata({
        prepared,
        fastPathReason: "planning_tomorrow",
        prefetchedReads: 3,
      }),
    );
    collector.recordToolExecution({
      round: 0,
      toolName: "list_tasks",
      safety: "read",
      resultTokensEstimated: 120,
      success: true,
      durationMs: 40,
    });
    collector.toolCallCount = 3;
    collector.toolRoundCount = 1;
    collector.recordModelRound(
      mockResponse({
        usage: fullUsage({ input_tokens: 7000, output_tokens: 400 }),
      }),
      1,
      estimateToolResultTokens(['{"success":true}']),
    );
    collector.logIfEnabled();

    const snapshot = collector.snapshot();
    expect(snapshot.modelRoundCount).toBe(1);
    expect(snapshot.toolCallCount).toBe(3);
    expect(snapshot.toolExecutions).toHaveLength(1);
    expect(snapshot.toolsExposedCount).toBe(0);
    expect(snapshot.foregroundTotals.estimatedToolSchemaTokens).toBe(0);
    expect(snapshot.contextComposition.estimatedToolSchemaTokens).toBe(0);
    expect(snapshot.routedToolsCount).toBe(planningExposure.tools.length);
    expect(snapshot.routedToolSchemasEstimated).toBe(
      estimateToolSchemaTokens(planningExposure.tools),
    );
    expect(snapshot.foregroundTotals.estimatedToolResultTokens).toBeGreaterThan(0);

    const output = logSpy.mock.calls.flat().join(" ");
    expect(output).toContain("fastPath=true");
    expect(output).toContain("fastPathReason=planning_tomorrow");
    expect(output).toContain("prefetchedReads=3");
    expect(output).toContain("rounds=1");
    expect(output).toContain("toolsExposed=0");
    expect(output).toContain("toolSchemasEstimated=0");
    expect(output).toContain(
      `routedToolsCount=${planningExposure.tools.length}`,
    );
    expect(output).toContain("routedToolSchemasEstimated=");
    expect(output).toContain("[JARVIS_USAGE_CONTEXT_EST]");
    expect(output).toContain("toolSchemas=0");
    expect(output).toContain("routedToolSchemas=");
    expect(output).not.toContain("What should I focus");

    logSpy.mockRestore();
  });

  it("reports actual exposed schemas for normal schedule routing", () => {
    const exposure = resolveMainJarvisToolExposure({
      message: "What does my day tomorrow look like?",
      confirmationIntent: "unknown",
      pendingAction: null,
      contextTarget: null,
    });

    const metadata = buildJarvisRequestUsageMetadata({
      tools: exposure.tools,
      toolRoutingReason: exposure.routingReason,
    });

    expect(exposure.tools).toHaveLength(4);
    expect(metadata.toolsExposedCount).toBe(4);
    expect(metadata.routedToolsCount).toBe(4);
    expect(metadata.contextComposition.estimatedToolSchemaTokens).toBe(
      estimateToolSchemaTokens(exposure.tools),
    );
    expect(metadata.routedToolSchemasEstimated).toBe(
      metadata.contextComposition.estimatedToolSchemaTokens,
    );
  });

  it("reports actual exposed schemas for normal planning routing", () => {
    const exposure = resolveMainJarvisToolExposure({
      message: "What should I focus on tomorrow?",
      confirmationIntent: "unknown",
      pendingAction: null,
      contextTarget: null,
    });

    const metadata = buildJarvisRequestUsageMetadata({
      tools: exposure.tools,
      toolRoutingReason: exposure.routingReason,
    });

    expect(exposure.tools).toHaveLength(10);
    expect(metadata.toolsExposedCount).toBe(10);
    expect(metadata.contextComposition.estimatedToolSchemaTokens).toBe(
      estimateToolSchemaTokens(exposure.tools),
    );
    expect(metadata.contextComposition.estimatedToolSchemaTokens).toBeGreaterThan(
      3000,
    );
  });

  it("zeros exposed schemas on fast path while preserving routed candidate estimate", () => {
    const exposure = resolveMainJarvisToolExposure({
      message: "What should I focus on tomorrow?",
      confirmationIntent: "unknown",
      pendingAction: null,
      contextTarget: null,
    });
    const prepared = buildJarvisRequestUsageMetadata({
      tools: exposure.tools,
      toolRoutingReason: exposure.routingReason,
    });

    const fastPath = buildFastPathUsageMetadata({
      prepared,
      fastPathReason: "planning_tomorrow",
      prefetchedReads: 3,
    });

    expect(fastPath.toolsExposedCount).toBe(0);
    expect(fastPath.contextComposition.estimatedToolSchemaTokens).toBe(0);
    expect(fastPath.routedToolsCount).toBe(10);
    expect(fastPath.routedToolSchemasEstimated).toBeGreaterThan(3000);
  });
});
