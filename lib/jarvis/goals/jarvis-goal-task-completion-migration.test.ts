import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260809010000_add_jarvis_goal_task_completion_rpc.sql";
const CONFIG_PATH = "supabase/config.toml";

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

function sqlWithoutComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

describe("jarvis goal task completion rpc migration", () => {
  const migration = readMigration();
  const migrationSql = sqlWithoutComments(migration);

  it("defines reconcile in jarvis_internal and public mutation RPC", () => {
    expect(migration).toContain("CREATE SCHEMA jarvis_internal");
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION jarvis_internal.reconcile_jarvis_goal_completion",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.set_jarvis_goal_task_completion",
    );
    expect(migrationSql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.reconcile_jarvis_goal_completion/,
    );
  });

  it("uses auth.uid() and only accepts task id plus completed boolean on public RPC", () => {
    const rpcStart = migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.set_jarvis_goal_task_completion",
    );
    const rpcBody = migration.slice(rpcStart);

    expect(rpcBody).toContain("v_user_id := auth.uid();");
    expect(rpcBody).not.toContain("p_user_id");
    expect(rpcBody).not.toContain("p_goal_id");
    expect(rpcBody).not.toContain("p_goal_level_id");
    expect(rpcBody).not.toContain("p_completed_at");
  });

  it("preserves blocker fields on completion update", () => {
    expect(migrationSql).not.toMatch(
      /UPDATE\s+public\.tasks[\s\S]*blocked_at\s*=\s*NULL/i,
    );
    expect(migrationSql).not.toMatch(
      /UPDATE\s+public\.tasks[\s\S]*blocked_reason\s*=\s*NULL/i,
    );
  });

  it("reopens tasks to todo and clears completed_at", () => {
    expect(migration).toContain("status = 'todo'::text");
    expect(migration).toContain("completed_at = NULL");
  });

  it("clears today_priority_goal_id when goal newly completes", () => {
    expect(migration).toContain("today_priority_goal_id = NULL");
    expect(migrationSql).not.toMatch(/current_focus/i);
  });

  it("rejects locked-level completion without mutating task", () => {
    expect(migration).toContain("'code', 'level_locked'");
    const lockedIndex = migration.indexOf("'code', 'level_locked'");
    const completeUpdateIndex = migration.indexOf(
      "SET status = 'done'::text",
    );
    expect(lockedIndex).toBeGreaterThan(-1);
    expect(completeUpdateIndex).toBeGreaterThan(-1);
    expect(migration.indexOf("level_locked")).toBeLessThan(completeUpdateIndex);
  });

  it("requires every level to have tasks before goal completion", () => {
    expect(migration).toContain("NOT EXISTS");
    expect(migration).toContain("v_incomplete_levels");
    expect(migration).toContain("AND t.goal_id = p_goal_id");
  });

  it("rejects NULL completion state before mutation", () => {
    expect(migration).toContain("IF p_completed IS NULL THEN");
    expect(migration).toContain("'code', 'invalid_completion_state'");
  });

  it("detects malformed goal task structures defensively", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION jarvis_internal.jarvis_goal_has_malformed_tasks",
    );
    expect(migration).toContain("t.user_id IS DISTINCT FROM auth.uid()");
    expect(migration).toContain("'code', 'malformed_goal_structure'");
    expect(migration).toContain("jarvis_internal.jarvis_goal_has_malformed_tasks");
  });

  it("treats empty levels as malformed goal structure", () => {
    expect(migration).toContain("WHERE t.goal_id = p_goal_id");
    expect(migration).toMatch(
      /jarvis_goal_has_malformed_tasks[\s\S]*NOT EXISTS[\s\S]*jarvis_goal_levels gl[\s\S]*NOT EXISTS[\s\S]*public\.tasks t/,
    );
  });

  it("uses SECURITY DEFINER on malformed helper so wrong-user rows are visible", () => {
    const helperStart = migration.indexOf(
      "CREATE OR REPLACE FUNCTION jarvis_internal.jarvis_goal_has_malformed_tasks",
    );
    const helperBody = migration.slice(helperStart, helperStart + 400);

    expect(helperBody).toContain("SECURITY DEFINER");
  });

  it("uses SECURITY DEFINER on public RPC so nested helper is callable", () => {
    const rpcStart = migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.set_jarvis_goal_task_completion",
    );
    const rpcBody = migration.slice(rpcStart, rpcStart + 500);

    expect(rpcBody).toContain("SECURITY DEFINER");
  });

  it("does not grant authenticated execute on internal helper or schema usage", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION jarvis_internal.reconcile_jarvis_goal_completion(uuid) FROM PUBLIC;",
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION jarvis_internal.jarvis_goal_has_malformed_tasks(uuid) FROM PUBLIC;",
    );
    expect(migrationSql).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+jarvis_internal\.reconcile_jarvis_goal_completion[\s\S]*TO\s+authenticated/i,
    );
    expect(migrationSql).not.toMatch(
      /GRANT\s+USAGE\s+ON\s+SCHEMA\s+jarvis_internal[\s\S]*TO\s+authenticated/i,
    );
  });

  it("revokes PUBLIC execute and grants authenticated on the public mutation RPC only", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.set_jarvis_goal_task_completion",
    );
    expect(migration).toContain("FROM PUBLIC;");
    expect(migration).toContain("FROM anon;");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.set_jarvis_goal_task_completion",
    );
    expect(migration).toContain("TO authenticated;");
    expect(migration).not.toContain("TO service_role");
  });
});

describe("jarvis goal task completion postgrest exposure", () => {
  it("does not expose jarvis_internal through Supabase API schemas", () => {
    const config = readFileSync(CONFIG_PATH, "utf8");
    expect(config).toContain('schemas = ["public", "graphql_public"]');
    expect(config).not.toContain("jarvis_internal");
  });
});
