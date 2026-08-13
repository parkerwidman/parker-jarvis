import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260813100000_add_jarvis_schedule_foundation.sql";

function readMigration(path: string): string {
  return readFileSync(path, "utf8");
}

function sqlWithoutComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

describe("jarvis schedule foundation migration schema", () => {
  const migration = readMigration(MIGRATION_PATH);
  const migrationSql = sqlWithoutComments(migration);

  it("creates all four schedule foundation tables", () => {
    expect(migration).toContain("CREATE TABLE public.jarvis_schedules");
    expect(migration).toContain("CREATE TABLE public.jarvis_schedule_items");
    expect(migration).toContain("CREATE TABLE public.jarvis_schedule_overrides");
    expect(migration).toContain(
      "CREATE TABLE public.jarvis_pending_schedule_actions",
    );
  });

  it("enables RLS and user ownership policies on all tables", () => {
    expect(migration.match(/ENABLE ROW LEVEL SECURITY/g)?.length).toBe(4);
    expect(migration).toContain(
      'CREATE POLICY "Users manage their own jarvis schedules"',
    );
    expect(migration).toContain(
      'CREATE POLICY "Users manage their own jarvis schedule items"',
    );
    expect(migration).toContain(
      'CREATE POLICY "Users manage their own jarvis schedule overrides"',
    );
    expect(migration).toContain(
      'CREATE POLICY "Users manage their own jarvis pending schedule actions"',
    );
    expect(migration).toContain("auth.uid() AS uid) = user_id");
  });

  it("defines schedule date and status checks", () => {
    expect(migration).toContain("jarvis_schedules_date_range_check");
    expect(migration).toContain("end_date >= start_date");
    expect(migration).toContain("jarvis_schedules_status_check");
    expect(migration).toContain("'draft'::text");
    expect(migration).toContain("'active'::text");
    expect(migration).toContain("'archived'::text");
    expect(migration).toContain("jarvis_schedules_name_check");
    expect(migration).toContain("jarvis_schedules_timezone_check");
  });

  it("defines schedule item category and weekday checks", () => {
    expect(migration).toContain("jarvis_schedule_items_day_of_week_check");
    expect(migration).toContain("day_of_week >= 0 AND day_of_week <= 6");
    expect(migration).toContain("jarvis_schedule_items_category_check");
    expect(migration).toContain("'morning_routine'::text");
    expect(migration).toContain("'recovery'::text");
    expect(migration).toContain("jarvis_schedule_items_effective_date_check");
    expect(migration).toContain(
      "effective_end_date IS NULL OR effective_end_date >= effective_start_date",
    );
  });

  it("defines override shape checks and one skip/replace override per item/date", () => {
    expect(migration).toContain("jarvis_schedule_overrides_type_check");
    expect(migration).toContain("jarvis_schedule_overrides_shape_check");
    expect(migration).toContain(
      "jarvis_schedule_overrides_item_date_skip_replace_idx",
    );
    expect(migration).toContain("override_type = ANY (ARRAY['skip'::text, 'replace'::text])");
  });

  it("includes failed in pending schedule action statuses", () => {
    expect(migration).toContain("jarvis_pending_schedule_actions_status_check");
    expect(migration).toContain("'failed'::text");
    expect(migration).toContain("'pending'::text");
    expect(migration).toContain("'confirmed'::text");
    expect(migration).toContain("'executed'::text");
    expect(migration).toContain("'cancelled'::text");
    expect(migration).toContain("'expired'::text");
  });

  it("enforces one active schedule per user", () => {
    expect(migration).toContain("jarvis_schedules_one_active_per_user_idx");
    expect(migration).toContain("WHERE status = 'active'::text");
  });

  it("uses ownership-aware composite foreign keys", () => {
    expect(migration).toContain("jarvis_schedules_id_user_id_key");
    expect(migration).toContain("UNIQUE (id, user_id)");
    expect(migration).toContain("jarvis_schedule_items_schedule_user_fkey");
    expect(migration).toContain(
      "REFERENCES public.jarvis_schedules(id, user_id) ON DELETE CASCADE",
    );
    expect(migration).toContain("jarvis_schedule_items_id_user_id_key");
    expect(migration).toContain("jarvis_schedule_overrides_schedule_user_fkey");
    expect(migration).toContain("jarvis_schedule_overrides_item_user_fkey");
    expect(migration).toContain(
      "REFERENCES public.jarvis_schedule_items(id, user_id) ON DELETE CASCADE",
    );
  });

  it("supports idempotent baseline lookup by user, name, and start date", () => {
    expect(migration).toContain("jarvis_schedules_user_id_name_start_date_key");
    expect(migration).toContain("UNIQUE (user_id, name, start_date)");
  });

  it("creates required indexes and updated_at triggers", () => {
    expect(migration).toContain("jarvis_schedules_user_start_date_idx");
    expect(migration).toContain("jarvis_schedule_items_schedule_day_start_idx");
    expect(migration).toContain("jarvis_schedule_items_schedule_effective_idx");
    expect(migration).toContain("jarvis_schedule_overrides_schedule_date_idx");
    expect(migration).toContain(
      "jarvis_pending_schedule_actions_user_status_created_idx",
    );
    expect(migration).toContain("set_jarvis_schedules_updated_at");
    expect(migration).toContain("set_jarvis_schedule_items_updated_at");
    expect(migration).toContain("set_jarvis_schedule_overrides_updated_at");
    expect(migration).toContain("set_jarvis_pending_schedule_actions_updated_at");
    expect(migrationSql).toContain("EXECUTE FUNCTION public.set_updated_at()");
  });

  it("includes an atomic bootstrap RPC granted to authenticated users", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.bootstrap_jarvis_schedule_with_items",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.bootstrap_jarvis_schedule_with_items",
    );
    expect(migration).toContain("TO authenticated");
    expect(migration).toContain("validate_jarvis_schedule_override_references");
  });

  it("does not create a hard FK from pending actions to agent_threads", () => {
    expect(migrationSql).not.toContain("REFERENCES public.agent_threads");
  });
});
