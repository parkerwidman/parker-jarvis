import "server-only";

/**
 * Default OpenAI embedding model for Jarvis durable memories.
 * text-embedding-3-small produces 1536-dimensional vectors by default.
 * @see https://platform.openai.com/docs/guides/embeddings
 */
export const JARVIS_MEMORY_EMBEDDING_MODEL =
  process.env.JARVIS_MEMORY_EMBEDDING_MODEL?.trim() ||
  "text-embedding-3-small";

/** Verified default output dimension for text-embedding-3-small (no dimensions param). */
export const JARVIS_MEMORY_EMBEDDING_DIMENSIONS = 1536;

export const MEMORY_EMBEDDING_REQUEST_TIMEOUT_MS = 5_000;

export const SEMANTIC_MEMORY_MATCH_COUNT = 15;
export const SEMANTIC_MEMORY_MATCH_THRESHOLD = 0.35;

export const HYBRID_LEXICAL_CANDIDATE_LIMIT = 30;
export const MEMORY_BACKFILL_BATCH_SIZE = 20;

export const HYBRID_RRF_K = 60;
/** Small tie-breaker only; must stay well below rank-1 RRF (~0.016). */
export const HYBRID_CONFIRMED_BOOST = 0.001;
/** Small tie-breaker only; max 5 * 0.0002 = 0.001 at importance 5. */
export const HYBRID_IMPORTANCE_BOOST = 0.0002;
/** Weight semantic similarity inside already-thresholded matches. */
export const HYBRID_SEMANTIC_SIMILARITY_WEIGHT = 0.01;
