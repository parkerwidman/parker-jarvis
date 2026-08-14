import type OpenAI from "openai";

import { estimateTokens } from "@/lib/jarvis/context-engine/context-budget";
import type {
  ContextEngineDiagnostics,
  MainInstructionSectionEstimates,
} from "@/lib/jarvis/context-engine/context-types";
import type { AgentKey } from "@/lib/jarvis/agents/types";

export type ModelRoundUsage = {
  round: number;
  model: string;
  inputTokens: number;
  cachedInputTokens?: number;
  uncachedInputTokens?: number;
  outputTokens: number;
  reasoningTokens?: number;
  totalTokens: number;
  toolsExposedCount: number;
  estimatedToolResultTokens?: number;
};

export type ContextCompositionEstimates = {
  estimatedCoreInstructionTokens: number;
  estimatedWorkingStateTokens: number;
  estimatedRecentConversationTokens: number;
  estimatedPersonalContextTokens: number;
  estimatedPendingActionTokens: number;
  estimatedSelectedRecordTokens: number;
  estimatedSummaryTokens: number;
  estimatedConversationInputTokens: number;
  estimatedToolSchemaTokens: number;
};

export type ForegroundUsageTotals = {
  totalInputTokens: number;
  totalCachedInputTokens: number;
  totalUncachedInputTokens: number;
  totalOutputTokens: number;
  totalReasoningTokens: number;
  totalTokens: number;
  estimatedToolSchemaTokens: number;
  estimatedToolResultTokens: number;
};

export type JarvisRequestUsage = {
  requestId: string;
  agentKey: AgentKey;
  modelRounds: ModelRoundUsage[];
  modelRoundCount: number;
  toolCallCount: number;
  toolRoundCount: number;
  toolsExposedCount: number;
  routedToolsCount?: number;
  routedToolSchemasEstimated?: number;
  toolRoutingReason?: string;
  toolExecutions: ToolExecutionUsageRecord[];
  contextComposition: ContextCompositionEstimates;
  foregroundTotals: ForegroundUsageTotals;
};

export type ConversationSummaryUsage = {
  category: "conversation_summary";
  conversationId: string;
  model: string;
  inputTokens: number;
  cachedInputTokens?: number;
  uncachedInputTokens?: number;
  outputTokens: number;
  reasoningTokens?: number;
  totalTokens: number;
  success: boolean;
};

export type ToolExecutionUsageRecord = {
  round: number;
  toolName: string;
  safety: "read" | "write" | "unknown";
  resultTokensEstimated: number;
  success: boolean | null;
  durationMs: number | null;
};

export function parseToolResultSuccess(output: string): boolean | null {
  try {
    const parsed = JSON.parse(output) as { success?: unknown };

    if (typeof parsed.success === "boolean") {
      return parsed.success;
    }

    return null;
  } catch {
    return null;
  }
}

export function logToolExecutionUsage(
  requestId: string,
  record: ToolExecutionUsageRecord,
): void {
  if (!isJarvisUsageLogsEnabled()) {
    return;
  }

  console.log(
    [
      "[JARVIS_USAGE_TOOL]",
      `requestId=${requestId}`,
      `round=${record.round}`,
      `tool=${record.toolName}`,
      `class=${record.safety}`,
      `resultTokensEstimated=${record.resultTokensEstimated}`,
      record.success === null ? null : `success=${record.success}`,
      record.durationMs === null ? null : `durationMs=${record.durationMs}`,
    ]
      .filter((part): part is string => part !== null)
      .join(" "),
  );
}

export type JarvisRequestUsageMetadata = {
  toolsExposedCount: number;
  routedToolsCount?: number;
  routedToolSchemasEstimated?: number;
  toolRoutingReason?: string;
  contextComposition: ContextCompositionEstimates;
  fastPath?: boolean;
  fastPathReason?: string;
  prefetchedReads?: number;
};

export function isJarvisUsageLogsEnabled(): boolean {
  return process.env.JARVIS_USAGE_LOGS === "1";
}

export function estimateToolSchemaTokens(
  tools: OpenAI.Responses.Tool[],
): number {
  if (tools.length === 0) {
    return 0;
  }

  return estimateTokens(JSON.stringify(tools));
}

export function estimateToolResultTokens(outputs: string[]): number {
  return outputs.reduce((total, output) => total + estimateTokens(output), 0);
}

export function buildContextCompositionEstimates(input: {
  tools: OpenAI.Responses.Tool[];
  diagnostics?: ContextEngineDiagnostics;
  sectionEstimates?: MainInstructionSectionEstimates;
}): ContextCompositionEstimates {
  const diagnostics = input.diagnostics;
  const sections = input.sectionEstimates;

  return {
    estimatedCoreInstructionTokens:
      sections?.estimatedCoreInstructionTokens ??
      diagnostics?.coreEstimatedTokens ??
      0,
    estimatedWorkingStateTokens: sections?.estimatedWorkingStateTokens ?? 0,
    estimatedRecentConversationTokens: diagnostics?.recentEstimatedTokens ?? 0,
    estimatedPersonalContextTokens: sections?.estimatedPersonalContextTokens ?? 0,
    estimatedPendingActionTokens: sections?.estimatedPendingActionTokens ?? 0,
    estimatedSelectedRecordTokens: sections?.estimatedSelectedRecordTokens ?? 0,
    estimatedSummaryTokens: diagnostics?.summaryEstimatedTokens ?? 0,
    estimatedConversationInputTokens:
      diagnostics?.conversationInputEstimatedTokens ?? 0,
    estimatedToolSchemaTokens: estimateToolSchemaTokens(input.tools),
  };
}

export function buildJarvisRequestUsageMetadata(input: {
  tools: OpenAI.Responses.Tool[];
  diagnostics?: ContextEngineDiagnostics;
  sectionEstimates?: MainInstructionSectionEstimates;
  toolRoutingReason?: string;
}): JarvisRequestUsageMetadata {
  const routedToolSchemasEstimated = estimateToolSchemaTokens(input.tools);

  return {
    toolsExposedCount: input.tools.length,
    routedToolsCount: input.tools.length,
    routedToolSchemasEstimated,
    toolRoutingReason: input.toolRoutingReason,
    contextComposition: buildContextCompositionEstimates(input),
  };
}

export function buildFastPathUsageMetadata(input: {
  prepared: JarvisRequestUsageMetadata;
  fastPathReason: string;
  prefetchedReads: number;
}): JarvisRequestUsageMetadata {
  return {
    ...input.prepared,
    toolsExposedCount: 0,
    toolRoutingReason: `read_fast_path:${input.fastPathReason}`,
    fastPath: true,
    fastPathReason: input.fastPathReason,
    prefetchedReads: input.prefetchedReads,
    contextComposition: {
      ...input.prepared.contextComposition,
      estimatedToolSchemaTokens: 0,
    },
  };
}

function shouldLogRoutedToolSchemaMetrics(
  metadata: JarvisRequestUsageMetadata | null,
): boolean {
  if (!metadata) {
    return false;
  }

  if (metadata.fastPath) {
    return true;
  }

  return (
    typeof metadata.routedToolsCount === "number" &&
    metadata.routedToolsCount !== metadata.toolsExposedCount
  );
}

export function extractModelRoundUsage(
  response: OpenAI.Responses.Response,
  round: number,
  toolsExposedCount: number,
  estimatedToolResultTokens?: number,
): ModelRoundUsage | null {
  const usage = response.usage;

  if (!usage) {
    return null;
  }

  const cachedInputTokens = usage.input_tokens_details?.cached_tokens;
  const inputTokens = usage.input_tokens;

  let uncachedInputTokens: number | undefined;

  if (typeof cachedInputTokens === "number" && cachedInputTokens >= 0) {
    uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  }

  const reasoningTokens = usage.output_tokens_details?.reasoning_tokens;

  return {
    round,
    model: response.model ?? "unknown",
    inputTokens,
    ...(typeof cachedInputTokens === "number"
      ? { cachedInputTokens, uncachedInputTokens }
      : {}),
    outputTokens: usage.output_tokens,
    ...(typeof reasoningTokens === "number" ? { reasoningTokens } : {}),
    totalTokens: usage.total_tokens,
    toolsExposedCount,
    ...(typeof estimatedToolResultTokens === "number" &&
    estimatedToolResultTokens > 0
      ? { estimatedToolResultTokens }
      : {}),
  };
}

export function aggregateForegroundTotals(
  modelRounds: ModelRoundUsage[],
  estimatedToolSchemaTokens: number,
): ForegroundUsageTotals {
  let totalInputTokens = 0;
  let totalCachedInputTokens = 0;
  let totalUncachedInputTokens = 0;
  let totalOutputTokens = 0;
  let totalReasoningTokens = 0;
  let totalTokens = 0;
  let estimatedToolResultTokens = 0;
  let hasCached = false;
  let hasUncached = false;
  let hasReasoning = false;

  for (const round of modelRounds) {
    totalInputTokens += round.inputTokens;
    totalOutputTokens += round.outputTokens;
    totalTokens += round.totalTokens;

    if (typeof round.cachedInputTokens === "number") {
      hasCached = true;
      totalCachedInputTokens += round.cachedInputTokens;
    }

    if (typeof round.uncachedInputTokens === "number") {
      hasUncached = true;
      totalUncachedInputTokens += round.uncachedInputTokens;
    }

    if (typeof round.reasoningTokens === "number") {
      hasReasoning = true;
      totalReasoningTokens += round.reasoningTokens;
    }

    if (typeof round.estimatedToolResultTokens === "number") {
      estimatedToolResultTokens += round.estimatedToolResultTokens;
    }
  }

  return {
    totalInputTokens,
    totalCachedInputTokens: hasCached ? totalCachedInputTokens : 0,
    totalUncachedInputTokens: hasUncached ? totalUncachedInputTokens : 0,
    totalOutputTokens,
    totalReasoningTokens: hasReasoning ? totalReasoningTokens : 0,
    totalTokens,
    estimatedToolSchemaTokens,
    estimatedToolResultTokens,
  };
}

export class JarvisRequestUsageCollector {
  readonly requestId: string;
  readonly agentKey: AgentKey;
  private readonly recordedResponseIds = new Set<string>();
  private readonly modelRounds: ModelRoundUsage[] = [];
  private readonly toolExecutions: ToolExecutionUsageRecord[] = [];
  private metadata: JarvisRequestUsageMetadata | null = null;
  toolCallCount = 0;
  toolRoundCount = 0;

  constructor(requestId: string, agentKey: AgentKey) {
    this.requestId = requestId;
    this.agentKey = agentKey;
  }

  setMetadata(metadata: JarvisRequestUsageMetadata): void {
    this.metadata = metadata;
  }

  recordToolExecution(record: ToolExecutionUsageRecord): void {
    this.toolExecutions.push(record);
    logToolExecutionUsage(this.requestId, record);
  }

  recordModelRound(
    response: OpenAI.Responses.Response,
    round: number,
    estimatedToolResultTokens?: number,
  ): ModelRoundUsage | null {
    if (response.id && this.recordedResponseIds.has(response.id)) {
      return null;
    }

    const toolsExposedCount = this.metadata?.toolsExposedCount ?? 0;
    const usage = extractModelRoundUsage(
      response,
      round,
      toolsExposedCount,
      estimatedToolResultTokens,
    );

    if (!usage) {
      return null;
    }

    if (response.id) {
      this.recordedResponseIds.add(response.id);
    }

    this.modelRounds.push(usage);
    return usage;
  }

  snapshot(): JarvisRequestUsage {
    const contextComposition =
      this.metadata?.contextComposition ??
      buildContextCompositionEstimates({ tools: [] });

    return {
      requestId: this.requestId,
      agentKey: this.agentKey,
      modelRounds: [...this.modelRounds],
      modelRoundCount: this.modelRounds.length,
      toolCallCount: this.toolCallCount,
      toolRoundCount: this.toolRoundCount,
      toolsExposedCount: this.metadata?.toolsExposedCount ?? 0,
      routedToolsCount: this.metadata?.routedToolsCount,
      routedToolSchemasEstimated: this.metadata?.routedToolSchemasEstimated,
      toolRoutingReason: this.metadata?.toolRoutingReason,
      toolExecutions: [...this.toolExecutions],
      contextComposition,
      foregroundTotals: aggregateForegroundTotals(
        this.modelRounds,
        contextComposition.estimatedToolSchemaTokens,
      ),
    };
  }

  logIfEnabled(): void {
    if (!isJarvisUsageLogsEnabled()) {
      return;
    }

    const usage = this.snapshot();
    const totals = usage.foregroundTotals;

    console.log(
      [
        "[JARVIS_USAGE]",
        `requestId=${usage.requestId}`,
        `agent=${usage.agentKey}`,
        `rounds=${usage.modelRoundCount}`,
        `toolRounds=${usage.toolRoundCount}`,
        `tools=${usage.toolCallCount}`,
        `toolsExposed=${usage.toolsExposedCount}`,
        `input=${totals.totalInputTokens}`,
        `cached=${totals.totalCachedInputTokens}`,
        `uncached=${totals.totalUncachedInputTokens}`,
        `output=${totals.totalOutputTokens}`,
        `reasoning=${totals.totalReasoningTokens}`,
        `total=${totals.totalTokens}`,
        `toolSchemasEstimated=${totals.estimatedToolSchemaTokens}`,
        `toolResultsEstimated=${totals.estimatedToolResultTokens}`,
        usage.toolRoutingReason
          ? `toolRouting=${usage.toolRoutingReason}`
          : null,
        this.metadata?.fastPath ? "fastPath=true" : null,
        this.metadata?.fastPathReason
          ? `fastPathReason=${this.metadata.fastPathReason}`
          : null,
        this.metadata?.prefetchedReads !== undefined
          ? `prefetchedReads=${this.metadata.prefetchedReads}`
          : null,
        shouldLogRoutedToolSchemaMetrics(this.metadata) &&
        this.metadata?.routedToolsCount !== undefined
          ? `routedToolsCount=${this.metadata.routedToolsCount}`
          : null,
        shouldLogRoutedToolSchemaMetrics(this.metadata) &&
        this.metadata?.routedToolSchemasEstimated !== undefined
          ? `routedToolSchemasEstimated=${this.metadata.routedToolSchemasEstimated}`
          : null,
      ]
        .filter((part): part is string => part !== null)
        .join(" "),
    );

    for (const round of usage.modelRounds) {
      console.log(
        [
          "[JARVIS_USAGE_ROUND]",
          `requestId=${usage.requestId}`,
          `round=${round.round}`,
          `model=${round.model}`,
          `input=${round.inputTokens}`,
          round.cachedInputTokens !== undefined
            ? `cached=${round.cachedInputTokens}`
            : null,
          round.uncachedInputTokens !== undefined
            ? `uncached=${round.uncachedInputTokens}`
            : null,
          `output=${round.outputTokens}`,
          round.reasoningTokens !== undefined
            ? `reasoning=${round.reasoningTokens}`
            : null,
          `total=${round.totalTokens}`,
          `toolsExposed=${round.toolsExposedCount}`,
          round.estimatedToolResultTokens !== undefined
            ? `toolResultsEstimated=${round.estimatedToolResultTokens}`
            : null,
        ]
          .filter((part): part is string => part !== null)
          .join(" "),
      );
    }

    const composition = usage.contextComposition;
    console.log(
      [
        "[JARVIS_USAGE_CONTEXT_EST]",
        `requestId=${usage.requestId}`,
        `core=${composition.estimatedCoreInstructionTokens}`,
        `workingState=${composition.estimatedWorkingStateTokens}`,
        `recent=${composition.estimatedRecentConversationTokens}`,
        `personal=${composition.estimatedPersonalContextTokens}`,
        `pending=${composition.estimatedPendingActionTokens}`,
        `selectedRecord=${composition.estimatedSelectedRecordTokens}`,
        `summary=${composition.estimatedSummaryTokens}`,
        `conversationInput=${composition.estimatedConversationInputTokens}`,
        `toolSchemas=${composition.estimatedToolSchemaTokens}`,
        shouldLogRoutedToolSchemaMetrics(this.metadata) &&
        this.metadata?.routedToolSchemasEstimated !== undefined
          ? `routedToolSchemas=${this.metadata.routedToolSchemasEstimated}`
          : null,
      ]
        .filter((part): part is string => part !== null)
        .join(" "),
    );
  }
}

let summaryTriggerCount = 0;

export function getConversationSummaryTriggerCount(): number {
  return summaryTriggerCount;
}

export function resetConversationSummaryTriggerCount(): void {
  summaryTriggerCount = 0;
}

export function recordConversationSummaryTrigger(): void {
  summaryTriggerCount += 1;
}

const recordedSummaryResponseIds = new Set<string>();

export function extractConversationSummaryUsage(
  response: OpenAI.Responses.Response,
  conversationId: string,
  success: boolean,
): ConversationSummaryUsage | null {
  if (response.id && recordedSummaryResponseIds.has(response.id)) {
    return null;
  }

  const usage = response.usage;

  if (!usage) {
    return null;
  }

  if (response.id) {
    recordedSummaryResponseIds.add(response.id);
  }

  const cachedInputTokens = usage.input_tokens_details?.cached_tokens;
  const inputTokens = usage.input_tokens;
  let uncachedInputTokens: number | undefined;

  if (typeof cachedInputTokens === "number" && cachedInputTokens >= 0) {
    uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  }

  const reasoningTokens = usage.output_tokens_details?.reasoning_tokens;

  return {
    category: "conversation_summary",
    conversationId,
    model: response.model ?? "unknown",
    inputTokens,
    ...(typeof cachedInputTokens === "number"
      ? { cachedInputTokens, uncachedInputTokens }
      : {}),
    outputTokens: usage.output_tokens,
    ...(typeof reasoningTokens === "number" ? { reasoningTokens } : {}),
    totalTokens: usage.total_tokens,
    success,
  };
}

export function logConversationSummaryUsage(
  usage: ConversationSummaryUsage,
): void {
  if (!isJarvisUsageLogsEnabled()) {
    return;
  }

  console.log(
    [
      "[JARVIS_USAGE_SUMMARY]",
      `conversation=${usage.conversationId}`,
      `model=${usage.model}`,
      `success=${usage.success}`,
      `input=${usage.inputTokens}`,
      usage.cachedInputTokens !== undefined
        ? `cached=${usage.cachedInputTokens}`
        : null,
      usage.uncachedInputTokens !== undefined
        ? `uncached=${usage.uncachedInputTokens}`
        : null,
      `output=${usage.outputTokens}`,
      usage.reasoningTokens !== undefined
        ? `reasoning=${usage.reasoningTokens}`
        : null,
      `total=${usage.totalTokens}`,
      `triggerCount=${summaryTriggerCount}`,
    ]
      .filter((part): part is string => part !== null)
      .join(" "),
  );
}

export function resetSummaryUsageDedupeForTests(): void {
  recordedSummaryResponseIds.clear();
}
