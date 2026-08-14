export type RequestPerformanceMark =
  | "request_received"
  | "auth_complete"
  | "thread_resolved"
  | "user_message_persisted"
  | "context_start"
  | "context_complete"
  | "first_safe_text_delta"
  | "final_round_first_text_delta"
  | "tool_round_start"
  | "tool_round_complete"
  | "final_model_complete"
  | "assistant_persist_start"
  | "assistant_persisted"
  | "stream_complete";

export type ModelRoundPerformance = {
  round: number;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  firstTextMs: number | null;
  toolCallsRequested: number;
  finalTextRound: boolean;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
};

export type ToolBatchPerformance = {
  round: number;
  startedAt: number;
  completedAt: number;
  durationMs: number;
};

export type RequestPerformanceSnapshot = {
  requestId: string;
  agentKey: string;
  marks: Partial<Record<RequestPerformanceMark, number>>;
  modelRounds: ModelRoundPerformance[];
  toolBatches: ToolBatchPerformance[];
  modelRoundCount: number;
  toolCallCount: number;
  toolRoundCount: number;
  success: boolean;
  failureCode: string | null;
};

export function isJarvisPerformanceLogsEnabled(): boolean {
  return process.env.JARVIS_PERFORMANCE_LOGS === "1";
}

export class RequestPerformanceCollector {
  readonly requestId: string;
  readonly agentKey: string;
  private readonly marks = new Map<RequestPerformanceMark, number>();
  private readonly startedAt: number;
  private readonly modelRounds: ModelRoundPerformance[] = [];
  private readonly toolBatches: ToolBatchPerformance[] = [];
  private currentModelRound:
    | {
        round: number;
        startedAt: number;
        firstTextAt: number | null;
      }
    | null = null;
  private currentToolBatch:
    | {
        round: number;
        startedAt: number;
      }
    | null = null;
  modelRoundCount = 0;
  toolCallCount = 0;
  toolRoundCount = 0;
  success = false;
  failureCode: string | null = null;
  private firstTextRecorded = false;
  private finalRoundFirstTextRecorded = false;
  fastPath = false;
  fastPathReason: string | null = null;
  prefetchedReads: number | null = null;

  constructor(requestId: string, agentKey: string, startedAt = Date.now()) {
    this.requestId = requestId;
    this.agentKey = agentKey;
    this.startedAt = startedAt;
    this.mark("request_received", startedAt);
  }

  setFastPathMetadata(input: {
    enabled: boolean;
    reason: string;
    prefetchedReads: number;
  }): void {
    this.fastPath = input.enabled;
    this.fastPathReason = input.reason;
    this.prefetchedReads = input.prefetchedReads;
  }

  mark(name: RequestPerformanceMark, timestamp = Date.now()): void {
    if (!this.marks.has(name)) {
      this.marks.set(name, timestamp);
    }
  }

  recordFirstSafeTextDelta(timestamp = Date.now()): void {
    if (this.firstTextRecorded) {
      return;
    }

    this.firstTextRecorded = true;
    this.mark("first_safe_text_delta", timestamp);
  }

  recordFinalRoundFirstSafeTextDelta(timestamp = Date.now()): void {
    if (this.finalRoundFirstTextRecorded) {
      return;
    }

    this.finalRoundFirstTextRecorded = true;
    this.mark("final_round_first_text_delta", timestamp);
    this.recordFirstSafeTextDelta(timestamp);
  }

  recordModelRoundFirstTextDelta(timestamp = Date.now()): void {
    if (this.currentModelRound && this.currentModelRound.firstTextAt === null) {
      this.currentModelRound.firstTextAt = timestamp;
    }
  }

  beginModelRound(round: number, timestamp = Date.now()): void {
    this.currentModelRound = {
      round,
      startedAt: timestamp,
      firstTextAt: null,
    };
  }

  completeModelRound(input: {
    toolCallsRequested: number;
    finalTextRound: boolean;
    inputTokens?: number | null;
    cachedInputTokens?: number | null;
    outputTokens?: number | null;
    reasoningTokens?: number | null;
    completedAt?: number;
  }): ModelRoundPerformance | null {
    if (!this.currentModelRound) {
      return null;
    }

    const completedAt = input.completedAt ?? Date.now();
    const { round, startedAt, firstTextAt } = this.currentModelRound;
    const record: ModelRoundPerformance = {
      round,
      startedAt,
      completedAt,
      durationMs: Math.max(0, completedAt - startedAt),
      firstTextMs:
        firstTextAt === null ? null : Math.max(0, firstTextAt - startedAt),
      toolCallsRequested: input.toolCallsRequested,
      finalTextRound: input.finalTextRound,
      inputTokens: input.inputTokens ?? null,
      cachedInputTokens: input.cachedInputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      reasoningTokens: input.reasoningTokens ?? null,
    };

    this.modelRounds.push(record);
    this.modelRoundCount = this.modelRounds.length;
    this.currentModelRound = null;

    if (input.finalTextRound && firstTextAt !== null) {
      this.recordFinalRoundFirstSafeTextDelta(firstTextAt);
    }

    if (input.finalTextRound) {
      this.mark("final_model_complete", completedAt);
    }

    this.logModelRoundIfEnabled(record);
    return record;
  }

  beginToolBatch(round: number, timestamp = Date.now()): void {
    this.currentToolBatch = {
      round,
      startedAt: timestamp,
    };
  }

  completeToolBatch(timestamp = Date.now()): ToolBatchPerformance | null {
    if (!this.currentToolBatch) {
      return null;
    }

    const record: ToolBatchPerformance = {
      round: this.currentToolBatch.round,
      startedAt: this.currentToolBatch.startedAt,
      completedAt: timestamp,
      durationMs: Math.max(0, timestamp - this.currentToolBatch.startedAt),
    };

    this.toolBatches.push(record);
    this.currentToolBatch = null;
    return record;
  }

  duration(from: RequestPerformanceMark, to: RequestPerformanceMark): number | null {
    const start = this.marks.get(from);
    const end = this.marks.get(to);

    if (start === undefined || end === undefined) {
      return null;
    }

    return Math.max(0, end - start);
  }

  snapshot(): RequestPerformanceSnapshot {
    return {
      requestId: this.requestId,
      agentKey: this.agentKey,
      marks: Object.fromEntries(this.marks.entries()),
      modelRounds: [...this.modelRounds],
      toolBatches: [...this.toolBatches],
      modelRoundCount: this.modelRoundCount,
      toolCallCount: this.toolCallCount,
      toolRoundCount: this.toolRoundCount,
      success: this.success,
      failureCode: this.failureCode,
    };
  }

  metrics(): Record<string, number | null> {
    const requestReceived = this.marks.get("request_received") ?? this.startedAt;

    const delta = (mark: RequestPerformanceMark): number | null => {
      const value = this.marks.get(mark);

      if (value === undefined) {
        return null;
      }

      return Math.max(0, value - requestReceived);
    };

    const modelMs = this.modelRounds.reduce(
      (total, round) => total + round.durationMs,
      0,
    );

    return {
      authMs: this.duration("request_received", "auth_complete"),
      threadMs: this.duration("auth_complete", "thread_resolved"),
      userPersistMs: this.duration("thread_resolved", "user_message_persisted"),
      preContextMs: this.duration("user_message_persisted", "context_start"),
      contextMs: this.duration("context_start", "context_complete"),
      modelMs: this.modelRounds.length > 0 ? modelMs : null,
      toolMs:
        this.toolBatches.length > 0
          ? this.toolBatches.reduce((total, batch) => total + batch.durationMs, 0)
          : null,
      assistantPersistMs: this.duration(
        "assistant_persist_start",
        "assistant_persisted",
      ),
      timeToFirstTextMs: delta("first_safe_text_delta"),
      finalRoundFirstTextMs: delta("final_round_first_text_delta"),
      totalMs: delta("stream_complete"),
      modelRoundCount: this.modelRoundCount,
      toolCallCount: this.toolCallCount,
      toolRoundCount: this.toolRoundCount,
    };
  }

  logModelRoundIfEnabled(round: ModelRoundPerformance): void {
    if (!isJarvisPerformanceLogsEnabled()) {
      return;
    }

    console.log(
      [
        "[JARVIS_PERFORMANCE_ROUND]",
        `requestId=${this.requestId}`,
        `round=${round.round}`,
        `durationMs=${round.durationMs}`,
        round.firstTextMs === null
          ? "firstTextMs=null"
          : `firstTextMs=${round.firstTextMs}`,
        `toolCalls=${round.toolCallsRequested}`,
        `final=${round.finalTextRound}`,
        round.inputTokens !== null ? `input=${round.inputTokens}` : null,
        round.cachedInputTokens !== null
          ? `cached=${round.cachedInputTokens}`
          : null,
        round.outputTokens !== null ? `output=${round.outputTokens}` : null,
        round.reasoningTokens !== null
          ? `reasoning=${round.reasoningTokens}`
          : null,
      ]
        .filter((part): part is string => part !== null)
        .join(" "),
    );
  }

  logIfEnabled(): void {
    if (!isJarvisPerformanceLogsEnabled()) {
      return;
    }

    const metrics = this.metrics();

    console.log(
      [
        "[JARVIS_PERFORMANCE]",
        `requestId=${this.requestId}`,
        `agent=${this.agentKey}`,
        `success=${this.success}`,
        metrics.authMs !== null ? `authMs=${metrics.authMs}` : null,
        metrics.threadMs !== null ? `threadMs=${metrics.threadMs}` : null,
        metrics.userPersistMs !== null
          ? `userPersistMs=${metrics.userPersistMs}`
          : null,
        metrics.preContextMs !== null
          ? `preContextMs=${metrics.preContextMs}`
          : null,
        metrics.contextMs !== null ? `contextMs=${metrics.contextMs}` : null,
        metrics.modelMs !== null ? `modelMs=${metrics.modelMs}` : null,
        metrics.toolMs !== null ? `toolMs=${metrics.toolMs}` : null,
        metrics.assistantPersistMs !== null
          ? `assistantPersistMs=${metrics.assistantPersistMs}`
          : null,
        metrics.timeToFirstTextMs !== null
          ? `timeToFirstTextMs=${metrics.timeToFirstTextMs}`
          : null,
        metrics.finalRoundFirstTextMs !== null
          ? `finalRoundFirstTextMs=${metrics.finalRoundFirstTextMs}`
          : null,
        metrics.totalMs !== null ? `totalMs=${metrics.totalMs}` : null,
        `modelRounds=${metrics.modelRoundCount ?? 0}`,
        `toolRounds=${metrics.toolRoundCount ?? 0}`,
        `toolCalls=${metrics.toolCallCount ?? 0}`,
        this.fastPath ? "fastPath=true" : null,
        this.fastPathReason ? `fastPathReason=${this.fastPathReason}` : null,
        this.prefetchedReads !== null
          ? `prefetchedReads=${this.prefetchedReads}`
          : null,
        this.failureCode ? `failureCode=${this.failureCode}` : null,
      ]
        .filter((part): part is string => part !== null)
        .join(" "),
    );
  }
}

export function extractUsageFields(usage: {
  input_tokens: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens: number;
  output_tokens_details?: { reasoning_tokens?: number };
}): {
  inputTokens: number;
  cachedInputTokens: number | null;
  outputTokens: number;
  reasoningTokens: number | null;
} {
  const cachedInputTokens = usage.input_tokens_details?.cached_tokens;

  return {
    inputTokens: usage.input_tokens,
    cachedInputTokens:
      typeof cachedInputTokens === "number" ? cachedInputTokens : null,
    outputTokens: usage.output_tokens,
    reasoningTokens:
      typeof usage.output_tokens_details?.reasoning_tokens === "number"
        ? usage.output_tokens_details.reasoning_tokens
        : null,
  };
}
