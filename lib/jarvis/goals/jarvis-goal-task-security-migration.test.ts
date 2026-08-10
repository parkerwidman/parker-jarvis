import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260809070000_add_jarvis_goal_task_security_hardening.sql";
const CREATE_RPC_PATH =
  "supabase/migrations/20260808200000_add_jarvis_goal_create_rpc.sql";

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

function sqlWithoutComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

describe("jarvis goal task security hardening migration", () => {
  const migration = readMigration();
  const migrationSql = sqlWithoutComments(migration);
  const originalCreateRpc = readFileSync(CREATE_RPC_PATH, "utf8");

  it("aligns create_jarvis_goal_with_roadmap to SECURITY DEFINER without changing its signature", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.create_jarvis_goal_with_roadmap(",
    );
    expect(migration).toContain("p_levels jsonb");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path TO ''");
    expect(migration).toContain("v_user_id := auth.uid();");
    expect(migration).not.toContain("p_user_id");
  });

  it("preserves create RPC validation and insert behavior from the original migration", () => {
    for (const marker of [
      "invalid_title",
      "invalid_domain",
      "invalid_goal_type",
      "invalid_levels",
      "invalid_level_name",
      "invalid_level_tasks",
      "invalid_task_title",
      "INSERT INTO public.tasks",
    ]) {
      expect(migration).toContain(marker);
    }

    expect(migration).toContain("v_level_position := v_level_index * 10");
    expect(migration).toContain("v_task_position := v_task_index * 10");
    expect(originalCreateRpc).not.toContain("SECURITY DEFINER");
  });

  it("keeps create RPC execute grants restricted to authenticated", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.create_jarvis_goal_with_roadmap",
    );
    expect(migration).toContain("FROM PUBLIC;");
    expect(migration).toContain("FROM anon;");
    expect(migration).toContain("TO authenticated;");
    expect(migrationSql).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.create_jarvis_goal_with_roadmap[\s\S]*TO\s+service_role/i,
    );
  });

  it("defines protect_jarvis_goal_task_mutations with direct-auth and attachment guards", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.protect_jarvis_goal_task_mutations",
    );
    expect(migration).toContain("is_direct_auth := current_user = 'authenticated'");
    expect(migration).not.toContain("session_user");
    expect(migration).not.toContain("auth.role()");
    expect(migration).not.toContain("request.jwt.claim.role");
    expect(migration).toContain("'goal_task_insert_requires_rpc'");
    expect(migration).toContain("'goal_task_attachment_immutable'");
    expect(migration).toContain("'goal_task_completion_requires_rpc'");
    expect(migration).toContain("'goal_task_position_requires_rpc'");
    expect(migration).toContain("'goal_task_delete_requires_rpc'");
  });

  it("wires the protection trigger before all task mutations", () => {
    expect(migration).toContain("CREATE TRIGGER protect_jarvis_goal_task_mutations");
    expect(migration).toContain("BEFORE INSERT OR UPDATE OR DELETE ON public.tasks");
    expect(migration).toContain(
      "EXECUTE FUNCTION public.protect_jarvis_goal_task_mutations()",
    );
  });

  it("does not touch current_focus or today priority behavior", () => {
    expect(migrationSql).not.toMatch(/current_focus/i);
    expect(migrationSql).not.toMatch(/today_priority_goal_id/i);
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.jarvis_profiles/i);
  });
});
