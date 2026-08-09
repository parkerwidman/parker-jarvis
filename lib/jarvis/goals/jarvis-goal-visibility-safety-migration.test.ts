import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260809050000_add_jarvis_goal_visibility_safety.sql";
const SQL_VALIDATION_PATH =
  "supabase/tests/jarvis_goal_visibility_safety_validation.sql";

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

function sqlWithoutComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

describe("jarvis goal visibility safety migration", () => {
  const migration = readSource(MIGRATION_PATH);
  const migrationSql = sqlWithoutComments(migration);
  const validation = readSource(SQL_VALIDATION_PATH);

  it("creates jarvis_visible_tasks with archived-goal visibility semantics", () => {
    expect(migration).toContain("CREATE OR REPLACE VIEW public.jarvis_visible_tasks");
    expect(migration).toContain("WITH (security_invoker = true)");
    expect(migration).toContain("SELECT t.*");
    expect(migration).toContain("FROM public.tasks t");
    expect(migration).toContain("LEFT JOIN public.jarvis_goals g");
    expect(migration).toContain("ON g.id = t.goal_id");
    expect(migration).toContain("t.goal_id IS NULL");
    expect(migration).toContain(
      "g.status IS DISTINCT FROM 'archived'::text",
    );
  });

  it("grants SELECT only on jarvis_visible_tasks", () => {
    expect(migration).toContain(
      "GRANT SELECT ON public.jarvis_visible_tasks TO authenticated",
    );
    expect(migration).toContain(
      "GRANT SELECT ON public.jarvis_visible_tasks TO service_role",
    );
    expect(migrationSql).not.toMatch(
      /GRANT\s+(INSERT|UPDATE|DELETE).*jarvis_visible_tasks/i,
    );
  });

  it("adds goal-side today priority cleanup trigger", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.clear_jarvis_today_priority_on_goal_change",
    );
    expect(migration).toContain("SET search_path TO ''");
    expect(migration).toContain(
      "AFTER UPDATE OF status, goal_type ON public.jarvis_goals",
    );
    expect(migration).toContain("today_priority_goal_id = NULL");
    expect(migration).toContain("AND today_priority_goal_id = NEW.id");
    expect(migration).not.toContain("current_focus");
    expect(migrationSql).not.toMatch(/SECURITY DEFINER/i);
  });

  it("revokes authenticated hard delete on jarvis_goals", () => {
    expect(migration).toContain(
      "REVOKE DELETE ON public.jarvis_goals FROM authenticated",
    );
  });

  it("SQL validation covers view, trigger, and delete safety", () => {
    expect(validation).toContain("standalone task must remain visible");
    expect(validation).toContain("active-goal task must remain visible");
    expect(validation).toContain("completed-goal task must remain visible");
    expect(validation).toContain("archived unfinished task must be hidden");
    expect(validation).toContain("archived completed task must be hidden");
    expect(validation).toContain(
      "archived task row must remain intact in public.tasks",
    );
    expect(validation).toContain(
      "user A must not see user B tasks through jarvis_visible_tasks",
    );
    expect(validation).toContain(
      "short_term -> three_month must clear today priority",
    );
    expect(validation).toContain(
      "short_term -> long_term must clear today priority",
    );
    expect(validation).toContain(
      "active -> archived must clear today priority",
    );
    expect(validation).toContain(
      "active -> completed must clear today priority",
    );
    expect(validation).toContain(
      "unrelated goal update must not clear another today priority",
    );
    expect(validation).toContain(
      "today priority cleanup must not modify current_focus",
    );
    expect(validation).toContain(
      "reconciliation completion must still clear today priority",
    );
    expect(validation).toContain(
      "authenticated must not have DELETE on jarvis_goals",
    );
  });
});
