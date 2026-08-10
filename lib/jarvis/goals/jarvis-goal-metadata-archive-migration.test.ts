import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260809060000_add_jarvis_goal_metadata_archive_rpcs.sql";

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

describe("jarvis goal metadata archive migration", () => {
  const migration = readMigration();

  it("creates partial-update metadata RPC with validation", () => {
    expect(migration).toContain("p_title text DEFAULT NULL");
    expect(migration).toContain("p_domain text DEFAULT NULL");
    expect(migration).toContain("p_goal_type text DEFAULT NULL");
    expect(migration).toContain("'no_changes'");
    expect(migration).toContain("'invalid_title'");
    expect(migration).toContain("'goal_archived'");
    expect(migration).toContain("FOR UPDATE");
  });

  it("creates idempotent archive RPC preserving completed_at", () => {
    expect(migration).toContain("'already_archived'");
    expect(migration).toContain("SET status = 'archived'::text");
    expect(migration).not.toContain("DELETE FROM public.tasks");
    expect(migration).not.toContain("completed_at = NULL");
  });

  it("creates restore RPC that reconciles status from tasks", () => {
    expect(migration).toContain("SET status = 'active'::text");
    expect(migration).toContain(
      "PERFORM jarvis_internal.reconcile_jarvis_goal_completion(p_goal_id)",
    );
    expect(migration).toContain("'goal_not_archived'");
  });

  it("locks down execute grants", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.update_jarvis_goal_metadata");
    expect(migration).toContain("FROM anon");
    expect(migration).toContain("TO authenticated");
    expect(migration).not.toContain("current_focus");
  });
});
