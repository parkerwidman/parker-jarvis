import "server-only";

import { createHash } from "node:crypto";

export function normalizeMemoryTextForEmbedding(content: string): string {
  return content.trim().replace(/\s+/g, " ");
}

export function buildMemoryEmbeddingInput(input: {
  category: string;
  content: string;
}): string {
  const normalized = normalizeMemoryTextForEmbedding(input.content);

  return `[${input.category.trim().toLowerCase()}] ${normalized}`;
}

export function computeMemoryContentHash(input: {
  category: string;
  content: string;
}): string {
  return createHash("sha256")
    .update(buildMemoryEmbeddingInput(input))
    .digest("hex");
}
