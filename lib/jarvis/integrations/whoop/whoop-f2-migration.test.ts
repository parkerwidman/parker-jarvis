import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../../..");
const MIGRATION_PATH =
  "supabase/migrations/20260811100000_add_whoop_f2_oauth_rpcs.sql";
const VALIDATION_PATH = "supabase/tests/whoop_f2_oauth_validation.sql";

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function sqlWithoutComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

describe("WHOOP F2 OAuth migration", () => {
  const migration = readSource(MIGRATION_PATH);
  const migrationSql = sqlWithoutComments(migration);
  const validation = readSource(VALIDATION_PATH);

  it("adds refresh single-flight metadata to credentials", () => {
    expect(migration).toContain("refresh_claim_id uuid");
    expect(migration).toContain("refresh_claimed_at timestamp with time zone");
    expect(migration).toContain("token_version bigint");
    expect(migration).not.toContain("ALTER TABLE public.whoop_connections");
  });

  it("creates server-only OAuth RPCs", () => {
    expect(migration).toContain("whoop_upsert_oauth_connection");
    expect(migration).toContain("whoop_claim_refresh");
    expect(migration).toContain("whoop_complete_refresh");
    expect(migration).toContain("whoop_release_refresh_claim");
    expect(migration).toContain("whoop_disconnect_connection");
  });

  it("uses SECURITY DEFINER with safe search_path", () => {
    expect(migrationSql.match(/SECURITY DEFINER/g)?.length).toBe(5);
    expect(migrationSql.match(/SET search_path TO ''/g)?.length).toBe(5);
  });

  it("grants RPC execute only to service_role", () => {
    expect(migrationSql).not.toMatch(
      /GRANT EXECUTE[\s\S]*whoop_upsert_oauth_connection[\s\S]*TO authenticated/i,
    );
    expect(migrationSql).not.toMatch(
      /GRANT EXECUTE[\s\S]*whoop_claim_refresh[\s\S]*TO authenticated/i,
    );
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.whoop_upsert_oauth_connection");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.whoop_claim_refresh");
    expect(migration).toContain("FROM authenticated");
  });

  it("complete refresh verifies claim ownership and token version", () => {
    expect(migration).toContain("refresh_claim_id = p_claim_id");
    expect(migration).toContain("token_version = p_prior_token_version");
  });

  it("SQL validation covers claim winner, wrong claim, and disconnect", () => {
    expect(validation).toContain("first refresh claim should succeed");
    expect(validation).toContain("second refresh claim should lose");
    expect(validation).toContain("wrong claim must not complete refresh");
    expect(validation).toContain("disconnect must delete credentials");
  });
});
