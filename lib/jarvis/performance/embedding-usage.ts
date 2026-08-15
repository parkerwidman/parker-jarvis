export type EmbeddingUsagePurpose = "query" | "memory_write" | "backfill";

export type EmbeddingUsageRecord = {
  requestId?: string;
  purpose: EmbeddingUsagePurpose;
  model: string;
  inputTokens: number | null;
  numberOfInputs: number;
  durationMs: number;
  success: boolean;
};

export function isJarvisEmbeddingUsageLogsEnabled(): boolean {
  return process.env.JARVIS_USAGE_LOGS === "1";
}

export function logEmbeddingUsage(record: EmbeddingUsageRecord): void {
  if (!isJarvisEmbeddingUsageLogsEnabled()) {
    return;
  }

  console.log(
    [
      "[JARVIS_USAGE_EMBEDDING]",
      record.requestId ? `requestId=${record.requestId}` : null,
      `purpose=${record.purpose}`,
      `model=${record.model}`,
      record.inputTokens === null ? null : `inputTokens=${record.inputTokens}`,
      `numberOfInputs=${record.numberOfInputs}`,
      `durationMs=${record.durationMs}`,
      `success=${record.success}`,
    ]
      .filter((part): part is string => part !== null)
      .join(" "),
  );
}
