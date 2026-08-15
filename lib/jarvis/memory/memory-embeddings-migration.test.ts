import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("jarvis memory embeddings migration", () => {
  const migrationPath = join(
    process.cwd(),
    "supabase/migrations/20260814140000_add_jarvis_memory_embeddings.sql",
  );
  const sql = readFileSync(migrationPath, "utf8");

  it("uses SECURITY INVOKER for semantic match RPC", () => {
    expect(sql).toContain("SECURITY INVOKER");
    expect(sql).not.toContain("SECURITY DEFINER");
  });

  it("scopes semantic search to auth.uid()", () => {
    expect(sql).toContain("m.user_id = auth.uid()");
    expect(sql).toContain("m.active = true");
  });

  it("uses verified 1536-dimension vectors for text-embedding-3-small", () => {
    expect(sql).toContain("vector(1536)");
  });

  it("invalidates stale embeddings when memory content changes", () => {
    expect(sql).toContain("invalidate_memory_embedding_on_content_change");
    expect(sql).toContain("NEW.embedding := NULL");
  });

  it("does not clear embeddings on deactivation", () => {
    expect(sql).not.toContain("NEW.active = false");
  });

  it("bounds RPC match_count and match_threshold", () => {
    expect(sql).toContain("LEAST(GREATEST(match_count, 1), 50)");
    expect(sql).toContain("LEAST(GREATEST(match_threshold, 0.0), 1.0)");
  });

  it("filters RPC results by expected embedding model", () => {
    expect(sql).toContain("expected_embedding_model");
    expect(sql).toContain("m.embedding_model = p.effective_model");
  });

  it("does not return raw embedding vectors from RPC", () => {
    expect(sql).toContain("similarity double precision");
    expect(sql).not.toMatch(/RETURNS TABLE[\s\S]*embedding extensions\.vector/);
  });

  it("uses exact cosine distance ordering without global HNSW index", () => {
    expect(sql).toContain("m.embedding <=> query_embedding");
    expect(sql).not.toContain("USING hnsw");
  });

  it("grants execute only to authenticated", () => {
    expect(sql).toContain("GRANT EXECUTE");
    expect(sql).toContain("TO authenticated");
    expect(sql).toContain("REVOKE ALL");
    expect(sql).not.toContain("TO anon");
  });
});
