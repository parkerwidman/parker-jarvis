import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260808070000_add_jarvis_goals_foundation.sql";
const REMOTE_SCHEMA_PATH =
  "supabase/migrations/20260729195114_remote_schema.sql";

function readMigration(path: string): string {
  return readFileSync(path, "utf8");
}

function sqlWithoutComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

describe("jarvis goals foundation migration schema", () => {
  const migration = readMigration(MIGRATION_PATH);
  const remoteSchema = readMigration(REMOTE_SCHEMA_PATH);
  const migrationSql = sqlWithoutComments(migration);

  it("creates jarvis_goals with required columns and checks", () => {
    expect(migration).toContain("CREATE TABLE public.jarvis_goals");
    expect(migration).toContain("goal_type    text                     NOT NULL");
    expect(migration).toContain("domain       text                     NOT NULL");
    expect(migration).toContain("sort_order   integer                  DEFAULT 0 NOT NULL");
    expect(migration).toContain("completed_at timestamp with time zone");
    expect(migration).toContain("jarvis_goals_goal_type_check");
    expect(migration).toContain("'short_term'::text");
    expect(migration).toContain("'three_month'::text");
    expect(migration).toContain("'long_term'::text");
    expect(migration).toContain("jarvis_goals_domain_check");
    expect(migration).toContain("'personal'::text");
    expect(migration).toContain("'melusi'::text");
    expect(migration).toContain("jarvis_goals_status_check");
    expect(migration).toContain("jarvis_goals_title_check");
    expect(migration).toContain("char_length(title) >= 1 AND char_length(title) <= 200");
  });

  it("creates jarvis_goal_levels with position uniqueness and ordering indexes", () => {
    expect(migration).toContain("CREATE TABLE public.jarvis_goal_levels");
    expect(migration).toContain("position   integer                  NOT NULL");
    expect(migration).toContain("jarvis_goal_levels_goal_id_position_key");
    expect(migration).toContain("UNIQUE (goal_id, position)");
    expect(migration).toContain("jarvis_goal_levels_user_goal_idx");
    expect(migration).toContain("jarvis_goal_levels_goal_position_idx");
  });

  it("extends tasks additively with nullable goal and blocked fields", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS goal_id uuid");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS goal_level_id uuid");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS position integer");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS blocked_at timestamp with time zone");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS blocked_reason text");
    expect(migration).toContain("tasks_blocked_reason_requires_blocked_at_check");
    expect(migration).toContain("blocked_at IS NOT NULL OR blocked_reason IS NULL");
    expect(migration).not.toContain("ADD COLUMN IF NOT EXISTS notes");
  });

  it("adds partial indexes for roadmap task lookups", () => {
    expect(migration).toContain("tasks_user_goal_idx");
    expect(migration).toContain("WHERE goal_id IS NOT NULL");
    expect(migration).toContain("tasks_user_goal_level_idx");
    expect(migration).toContain("WHERE goal_level_id IS NOT NULL");
    expect(migration).not.toContain("tasks_goal_level_position_idx");
    expect(migration).toContain("tasks_goal_level_position_key");
    expect(migration).toContain("CREATE UNIQUE INDEX tasks_goal_level_position_key");
    expect(migration).toContain("(goal_level_id, position)");
    expect(migration).toContain(
      "WHERE goal_level_id IS NOT NULL AND position IS NOT NULL",
    );
  });

  it("enforces deterministic task ordering within each goal level", () => {
    const uniquePartialIndex = migration.match(
      /CREATE UNIQUE INDEX tasks_goal_level_position_key[\s\S]*?;/,
    )?.[0];

    expect(uniquePartialIndex).toBeDefined();
    expect(uniquePartialIndex).toContain("(goal_level_id, position)");
    expect(uniquePartialIndex).toContain(
      "WHERE goal_level_id IS NOT NULL AND position IS NOT NULL",
    );
    expect(migrationSql).not.toMatch(
      /CREATE\s+(UNIQUE\s+)?INDEX[\s\S]*?\bposition\b[\s\S]*?WHERE\s+position\s+IS\s+NOT\s+NULL(?![\s\S]*goal_level_id)/i,
    );
  });

  describe("task position ordering invariants", () => {
    const uniquePartialIndex = migration.match(
      /CREATE UNIQUE INDEX tasks_goal_level_position_key[\s\S]*?;/,
    )?.[0];

    it("A: rejects duplicate position within the same goal level", () => {
      expect(uniquePartialIndex).toContain("UNIQUE");
      expect(uniquePartialIndex).toContain("(goal_level_id, position)");
      expect(uniquePartialIndex).toContain("goal_level_id IS NOT NULL");
      expect(uniquePartialIndex).toContain("position IS NOT NULL");
    });

    it("B: allows the same position across different goal levels", () => {
      expect(uniquePartialIndex).toContain("(goal_level_id, position)");
      expect(uniquePartialIndex).not.toContain("UNIQUE (position)");
      expect(migrationSql).not.toMatch(/UNIQUE\s*\(\s*position\s*\)/i);
    });

    it("C: allows NULL position for level-attached tasks", () => {
      expect(uniquePartialIndex).toContain("position IS NOT NULL");
      expect(migration).toContain("ADD COLUMN IF NOT EXISTS position integer");
      expect(migration).toMatch(
        /ALTER TABLE public\.tasks[\s\S]*ADD COLUMN IF NOT EXISTS position integer;/,
      );
      expect(migration).not.toMatch(
        /ALTER TABLE public\.tasks[\s\S]*ADD COLUMN IF NOT EXISTS position integer NOT NULL/i,
      );
    });

    it("D: leaves standalone unassigned tasks unaffected", () => {
      expect(migration).toContain("ADD COLUMN IF NOT EXISTS goal_level_id uuid");
      expect(migrationSql).not.toMatch(
        /goal_level_id\s+uuid\s+NOT\s+NULL/i,
      );
      expect(uniquePartialIndex).toContain("goal_level_id IS NOT NULL");
    });
  });

  it("adds today_priority_goal_id to jarvis_profiles without touching current_focus", () => {
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS today_priority_goal_id uuid",
    );
    expect(migration).toContain("jarvis_profiles_today_priority_goal_id_fkey");
    expect(migration).not.toContain("current_focus");
    expect(remoteSchema).toContain("current_focus       text");
  });

  it("enforces goal/level/task/profile invariants via validation triggers", () => {
    expect(migration).toContain("validate_jarvis_goal_level_user_id");
    expect(migration).toContain(
      "jarvis goal level user must match parent goal user",
    );
    expect(migration).toContain("validate_task_goal_references");
    expect(migration).toContain("task goal must belong to the same user");
    expect(migration).toContain("task goal level must belong to the same user");
    expect(migration).toContain("NEW.goal_id := level_goal_id");
    expect(migration).toContain(
      "task goal level must belong to the same goal as task.goal_id",
    );
    expect(migration).toContain("validate_jarvis_profile_today_priority_goal");
    expect(migration).toContain("today priority goal must be a short-term goal");
    expect(migration).toContain("today priority goal must be active");
    expect(migration).toContain(
      "today priority goal must belong to the same user",
    );
  });

  it("uses existing updated_at helper and enables authenticated self-access RLS", () => {
    expect(migration).toContain("EXECUTE FUNCTION public.set_updated_at()");
    expect(migration).toContain('CREATE POLICY "Users manage their own jarvis goals"');
    expect(migration).toContain(
      'CREATE POLICY "Users manage their own jarvis goal levels"',
    );
    expect(migration).toContain("TO authenticated");
    expect(migration).toContain("auth.uid() AS uid) = user_id");
  });

  it("grants service_role read-only access to goals tables", () => {
    expect(migration).toContain("GRANT SELECT ON TABLE");
    expect(migration).toContain("public.jarvis_goals");
    expect(migration).toContain("public.jarvis_goal_levels");
    expect(migration).toContain("TO service_role");
    expect(migrationSql).not.toMatch(
      /GRANT\s+(INSERT|UPDATE|DELETE).*jarvis_goals/i,
    );
    expect(migrationSql).not.toMatch(
      /GRANT\s+(INSERT|UPDATE|DELETE).*jarvis_goal_levels/i,
    );
  });

  it("does not alter legacy goals or weaken existing tasks policies", () => {
    expect(migrationSql).not.toMatch(/\bpublic\.goals\b/i);
    expect(migrationSql).not.toMatch(/ALTER TABLE public\.goals/i);
    expect(migrationSql).not.toMatch(/DROP POLICY/i);
    expect(migrationSql).not.toMatch(/ALTER POLICY/i);
    expect(remoteSchema).toContain('CREATE POLICY "Users can view their own tasks"');
  });

  it("does not introduce persisted current/locked level fields or completion automation", () => {
    expect(migration).not.toContain("current_level");
    expect(migration).not.toMatch(/\bis_locked\b/);
    expect(migration).not.toMatch(/\blevel_locked\b/);
    expect(migrationSql).not.toMatch(/complete.*goal/i);
    expect(migrationSql).not.toMatch(/reconcile.*goal/i);
  });

  it("remains additive with no destructive DDL", () => {
    const ddlWithoutGrantsAndFkActions = migrationSql
      .replace(/GRANT[\s\S]*?;/gi, "")
      .replace(/ON DELETE (CASCADE|SET NULL)/gi, "");

    expect(migrationSql).not.toMatch(/\bDROP\b/i);
    expect(migrationSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(ddlWithoutGrantsAndFkActions).not.toMatch(/\bDELETE\b/i);
    expect(migrationSql).not.toMatch(/ALTER\s+TABLE[\s\S]*?\bDROP\b/i);
  });

  it("documents validation coverage for goal types, domains, and attachment rules", () => {
    const coverage = {
      existingTaskInsert: migration.includes("ADD COLUMN IF NOT EXISTS goal_id uuid"),
      shortTermPersonal: migration.includes("'short_term'::text") &&
        migration.includes("'personal'::text"),
      shortTermMelusi: migration.includes("'melusi'::text"),
      threeMonthGoal: migration.includes("'three_month'::text"),
      longTermGoal: migration.includes("'long_term'::text"),
      invalidGoalTypeRejected: migration.includes("jarvis_goals_goal_type_check"),
      invalidDomainRejected: migration.includes("jarvis_goals_domain_check"),
      levelBelongsToGoal: migration.includes("validate_jarvis_goal_level_user_id"),
      duplicateLevelPositionRejected: migration.includes(
        "jarvis_goal_levels_goal_id_position_key",
      ),
      duplicateTaskPositionWithinLevelRejected: migration.includes(
        "tasks_goal_level_position_key",
      ),
      taskGoalLevelMatch: migration.includes(
        "task goal level must belong to the same goal as task.goal_id",
      ),
      crossUserGoalRejected: migration.includes(
        "task goal must belong to the same user",
      ),
      crossUserLevelRejected: migration.includes(
        "task goal level must belong to the same user",
      ),
      blockedReasonWithoutBlockedAtRejected: migration.includes(
        "tasks_blocked_reason_requires_blocked_at_check",
      ),
      profileShortTermOnly: migration.includes(
        "today priority goal must be a short-term goal",
      ),
      profileActiveOnly: migration.includes("today priority goal must be active"),
      profileClearable: migration.includes(
        "IF NEW.today_priority_goal_id IS NULL THEN",
      ),
    };

    expect(Object.values(coverage).every(Boolean)).toBe(true);
  });
});
