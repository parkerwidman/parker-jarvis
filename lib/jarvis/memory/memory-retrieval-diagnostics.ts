export type MemoryRetrievalDiagnostics = {
  retrievalMode: "lexical" | "hybrid";
  lexicalCandidates: number;
  semanticCandidates: number;
  mergedCandidates: number;
  injectedCount: number;
  embeddingCalled: boolean;
  embeddingMs: number | null;
  semanticSearchMs: number | null;
  totalMemoryRetrievalMs: number;
};

export function isJarvisMemoryLogsEnabled(): boolean {
  return process.env.JARVIS_MEMORY_LOGS === "1";
}

export function logMemoryRetrievalDiagnostics(input: {
  requestId?: string;
  diagnostics: MemoryRetrievalDiagnostics;
}): void {
  if (!isJarvisMemoryLogsEnabled()) {
    return;
  }

  const diagnostics = input.diagnostics;

  console.log(
    [
      "[JARVIS_MEMORY]",
      input.requestId ? `requestId=${input.requestId}` : null,
      `retrievalMode=${diagnostics.retrievalMode}`,
      `lexicalCandidates=${diagnostics.lexicalCandidates}`,
      `semanticCandidates=${diagnostics.semanticCandidates}`,
      `mergedCandidates=${diagnostics.mergedCandidates}`,
      `injectedCount=${diagnostics.injectedCount}`,
      `embeddingCalled=${diagnostics.embeddingCalled}`,
      diagnostics.embeddingMs === null ? null : `embeddingMs=${diagnostics.embeddingMs}`,
      diagnostics.semanticSearchMs === null
        ? null
        : `semanticSearchMs=${diagnostics.semanticSearchMs}`,
      `totalMemoryRetrievalMs=${diagnostics.totalMemoryRetrievalMs}`,
    ]
      .filter((part): part is string => part !== null)
      .join(" "),
  );
}
