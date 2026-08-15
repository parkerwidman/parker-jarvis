import "server-only";

import OpenAI from "openai";

import {
  JARVIS_MEMORY_EMBEDDING_DIMENSIONS,
  JARVIS_MEMORY_EMBEDDING_MODEL,
  MEMORY_EMBEDDING_REQUEST_TIMEOUT_MS,
} from "@/lib/jarvis/memory/memory-embedding-config";
import {
  buildMemoryEmbeddingInput,
  computeMemoryContentHash,
  normalizeMemoryTextForEmbedding,
} from "@/lib/jarvis/memory/memory-content-hash";
import {
  logEmbeddingUsage,
  type EmbeddingUsagePurpose,
} from "@/lib/jarvis/performance/embedding-usage";

export type MemoryEmbeddingResult = {
  embedding: number[];
  model: string;
  dimensions: number;
  contentHash: string;
  inputTokens: number | null;
};

export type QueryEmbeddingResult = {
  embedding: number[];
  model: string;
  dimensions: number;
  inputTokens: number | null;
};

function getOpenAiClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

export function validateEmbeddingVector(
  embedding: number[],
  expectedDimensions = JARVIS_MEMORY_EMBEDDING_DIMENSIONS,
): void {
  if (embedding.length !== expectedDimensions) {
    throw new Error(
      `Embedding dimension mismatch: expected ${expectedDimensions}, received ${embedding.length}.`,
    );
  }
}

export function normalizeQueryTextForEmbedding(text: string): string {
  return normalizeMemoryTextForEmbedding(text);
}

export async function createMemoryEmbedding(input: {
  category: string;
  content: string;
  purpose?: EmbeddingUsagePurpose;
  requestId?: string;
}): Promise<MemoryEmbeddingResult> {
  const startedAt = Date.now();
  const contentHash = computeMemoryContentHash(input);
  const embeddingInput = buildMemoryEmbeddingInput(input);

  try {
    const openai = getOpenAiClient();
    const response = await openai.embeddings.create(
      {
        model: JARVIS_MEMORY_EMBEDDING_MODEL,
        input: embeddingInput,
      },
      {
        signal: AbortSignal.timeout(MEMORY_EMBEDDING_REQUEST_TIMEOUT_MS),
      },
    );

    const vector = response.data[0]?.embedding;

    if (!vector) {
      throw new Error("Embedding API returned no vector.");
    }

    validateEmbeddingVector(vector);

    logEmbeddingUsage({
      requestId: input.requestId,
      purpose: input.purpose ?? "memory_write",
      model: response.model ?? JARVIS_MEMORY_EMBEDDING_MODEL,
      inputTokens: response.usage?.prompt_tokens ?? null,
      numberOfInputs: 1,
      durationMs: Date.now() - startedAt,
      success: true,
    });

    return {
      embedding: vector,
      model: response.model ?? JARVIS_MEMORY_EMBEDDING_MODEL,
      dimensions: vector.length,
      contentHash,
      inputTokens: response.usage?.prompt_tokens ?? null,
    };
  } catch (error) {
    logEmbeddingUsage({
      requestId: input.requestId,
      purpose: input.purpose ?? "memory_write",
      model: JARVIS_MEMORY_EMBEDDING_MODEL,
      inputTokens: null,
      numberOfInputs: 1,
      durationMs: Date.now() - startedAt,
      success: false,
    });

    throw error;
  }
}

export async function createQueryEmbedding(input: {
  query: string;
  purpose?: EmbeddingUsagePurpose;
  requestId?: string;
}): Promise<QueryEmbeddingResult> {
  const startedAt = Date.now();
  const embeddingInput = normalizeQueryTextForEmbedding(input.query);

  if (embeddingInput.length === 0) {
    throw new Error("Query embedding input is empty.");
  }

  try {
    const openai = getOpenAiClient();
    const response = await openai.embeddings.create(
      {
        model: JARVIS_MEMORY_EMBEDDING_MODEL,
        input: embeddingInput,
      },
      {
        signal: AbortSignal.timeout(MEMORY_EMBEDDING_REQUEST_TIMEOUT_MS),
      },
    );

    const vector = response.data[0]?.embedding;

    if (!vector) {
      throw new Error("Embedding API returned no vector.");
    }

    validateEmbeddingVector(vector);

    logEmbeddingUsage({
      requestId: input.requestId,
      purpose: input.purpose ?? "query",
      model: response.model ?? JARVIS_MEMORY_EMBEDDING_MODEL,
      inputTokens: response.usage?.prompt_tokens ?? null,
      numberOfInputs: 1,
      durationMs: Date.now() - startedAt,
      success: true,
    });

    return {
      embedding: vector,
      model: response.model ?? JARVIS_MEMORY_EMBEDDING_MODEL,
      dimensions: vector.length,
      inputTokens: response.usage?.prompt_tokens ?? null,
    };
  } catch (error) {
    logEmbeddingUsage({
      requestId: input.requestId,
      purpose: input.purpose ?? "query",
      model: JARVIS_MEMORY_EMBEDDING_MODEL,
      inputTokens: null,
      numberOfInputs: 1,
      durationMs: Date.now() - startedAt,
      success: false,
    });

    throw error;
  }
}

export async function createMemoryEmbeddingsBatch(input: {
  items: Array<{ category: string; content: string }>;
  purpose?: EmbeddingUsagePurpose;
  requestId?: string;
}): Promise<MemoryEmbeddingResult[]> {
  if (input.items.length === 0) {
    return [];
  }

  const startedAt = Date.now();
  const hashes = input.items.map((item) => computeMemoryContentHash(item));
  const embeddingInputs = input.items.map((item) =>
    buildMemoryEmbeddingInput(item),
  );

  try {
    const openai = getOpenAiClient();
    const response = await openai.embeddings.create(
      {
        model: JARVIS_MEMORY_EMBEDDING_MODEL,
        input: embeddingInputs,
      },
      {
        signal: AbortSignal.timeout(MEMORY_EMBEDDING_REQUEST_TIMEOUT_MS),
      },
    );

    const results = response.data
      .slice()
      .sort((left, right) => left.index - right.index)
      .map((entry, index) => {
        validateEmbeddingVector(entry.embedding);

        return {
          embedding: entry.embedding,
          model: response.model ?? JARVIS_MEMORY_EMBEDDING_MODEL,
          dimensions: entry.embedding.length,
          contentHash: hashes[index] ?? computeMemoryContentHash(input.items[index]!),
          inputTokens: null,
        } satisfies MemoryEmbeddingResult;
      });

    logEmbeddingUsage({
      requestId: input.requestId,
      purpose: input.purpose ?? "backfill",
      model: response.model ?? JARVIS_MEMORY_EMBEDDING_MODEL,
      inputTokens: response.usage?.prompt_tokens ?? null,
      numberOfInputs: input.items.length,
      durationMs: Date.now() - startedAt,
      success: true,
    });

    return results;
  } catch (error) {
    logEmbeddingUsage({
      requestId: input.requestId,
      purpose: input.purpose ?? "backfill",
      model: JARVIS_MEMORY_EMBEDDING_MODEL,
      inputTokens: null,
      numberOfInputs: input.items.length,
      durationMs: Date.now() - startedAt,
      success: false,
    });

    throw error;
  }
}
