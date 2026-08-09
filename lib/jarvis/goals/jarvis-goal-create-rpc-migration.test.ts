import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260808200000_add_jarvis_goal_create_rpc.sql";

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

function sqlWithoutComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

describe("jarvis goal create rpc migration", () => {
  const migration = readMigration();
  const migrationSql = sqlWithoutComments(migration);

  it("defines an atomic create_jarvis_goal_with_roadmap RPC", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.create_jarvis_goal_with_roadmap",
    );
    expect(migration).toContain("p_levels jsonb");
    expect(migration).toContain("RETURNS jsonb");
  });

  it("uses auth.uid() and does not accept a spoofable user id parameter", () => {
    expect(migration).toContain("v_user_id := auth.uid();");
    expect(migration).not.toContain("p_user_id");
  });

  it("P/Q. validates title, domain, goal type, levels, level names, and task titles before inserts", () => {
    const insertGoalIndex = migration.indexOf("INSERT INTO public.jarvis_goals");
    const validationMarkers = [
      "invalid_title",
      "invalid_domain",
      "invalid_goal_type",
      "invalid_levels",
      "invalid_level_name",
      "invalid_level_tasks",
      "invalid_task_title",
    ];

    for (const marker of validationMarkers) {
      expect(migration.indexOf(marker)).toBeGreaterThan(-1);
      expect(migration.indexOf(marker)).toBeLessThan(insertGoalIndex);
    }
  });

  it("I. assigns gap-based level and task positions during insert", () => {
    expect(migration).toContain("v_level_position := v_level_index * 10");
    expect(migration).toContain("v_task_position := v_task_index * 10");
  });

  it("creates todo/medium tasks with goal and level references", () => {
    expect(migration).toContain("INSERT INTO public.tasks");
    expect(migration).toContain("'todo'::text");
    expect(migration).toContain("'medium'::text");
    expect(migration).toContain("goal_id");
    expect(migration).toContain("goal_level_id");
    expect(migration).toContain("position");
    expect(migration).toContain("blocked_at");
    expect(migration).toContain("blocked_reason");
  });

  it("T. does not assign today priority or current focus", () => {
    expect(migrationSql).not.toMatch(/today_priority_goal_id/i);
    expect(migrationSql).not.toMatch(/current_focus/i);
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.jarvis_profiles/i);
  });

  it("Q. avoids exception swallowing that would commit partial state", () => {
    expect(migration).not.toContain("EXCEPTION");
    expect(migration).not.toContain("WHEN OTHERS");
  });

  it("1/A. revokes PUBLIC execute and grants authenticated as the application role", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.create_jarvis_goal_with_roadmap",
    );
    expect(migration).toContain("FROM PUBLIC;");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.create_jarvis_goal_with_roadmap",
    );
    expect(migration).toContain("TO authenticated;");
  });

  it("B/C/D. keeps anon and service_role off the explicit execute/write path", () => {
    expect(migration).toContain("FROM anon;");
    expect(migrationSql).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.create_jarvis_goal_with_roadmap[\s\S]*TO\s+anon/i,
    );
    expect(migration).not.toContain("TO service_role");
    expect(migrationSql).not.toMatch(
      /GRANT\s+(INSERT|UPDATE|DELETE).*jarvis_goals/i,
    );
    expect(migrationSql).not.toMatch(
      /GRANT\s+(INSERT|UPDATE|DELETE).*jarvis_goal_levels/i,
    );
  });

  it("7. rejects non-object level entries before inserts", () => {
    const insertGoalIndex = migration.indexOf("INSERT INTO public.jarvis_goals");
    const levelTypeCheck = migration.indexOf("jsonb_typeof(v_level) <> 'object'::text");

    expect(levelTypeCheck).toBeGreaterThan(-1);
    expect(levelTypeCheck).toBeLessThan(insertGoalIndex);
    expect(migration).toContain("'code', 'invalid_levels'");
  });

  it("2-5. rejects non-string task elements at the RPC boundary", () => {
    const insertGoalIndex = migration.indexOf("INSERT INTO public.jarvis_goals");
    const taskTypeCheck = migration.indexOf(
      "jsonb_typeof(v_task_element) <> 'string'::text",
    );

    expect(taskTypeCheck).toBeGreaterThan(-1);
    expect(taskTypeCheck).toBeLessThan(insertGoalIndex);
    expect(migration).toContain("jsonb_array_elements(v_level->'tasks')");
    expect(migration).not.toContain("jsonb_array_elements_text(v_level->'tasks')");
    expect(migration).toContain("v_task_title := trim(v_task_element #>> '{}')");
  });

  it("6. validates trimmed string task titles for normal string task arrays", () => {
    expect(migration).toContain("char_length(v_task_title) < 1");
    expect(migration).toContain("char_length(v_task_title) > 200");
  });

  it("does not use SECURITY DEFINER", () => {
    expect(migration).not.toContain("SECURITY DEFINER");
  });
});
