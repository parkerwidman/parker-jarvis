import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260812180000_add_jarvis_goals_d41_foundation.sql";

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

describe("jarvis goals D4.1 foundation migration", () => {
  const migration = readMigration();

  it("adds nullable target_date and notes to jarvis_goals", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS target_date date");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS notes text");
    expect(migration).toContain("jarvis_goals_notes_check");
  });

  it("creates jarvis_goal_priorities with domain+horizon uniqueness", () => {
    expect(migration).toContain("CREATE TABLE public.jarvis_goal_priorities");
    expect(migration).toContain("jarvis_goal_priorities_user_domain_goal_type_key");
    expect(migration).toContain("UNIQUE (user_id, domain, goal_type)");
    expect(migration).toContain("jarvis_goal_priorities_goal_id_fkey");
    expect(migration).toContain("REFERENCES public.jarvis_goals(id) ON DELETE CASCADE");
  });

  it("enables RLS and user ownership policy on priorities", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain('"Users manage their own jarvis goal priorities"');
    expect(migration).toContain("auth.uid() AS uid) = user_id");
  });

  it("migrates legacy today_priority_goal_id into jarvis_goal_priorities", () => {
    expect(migration).toContain("p.today_priority_goal_id");
    expect(migration).toContain("INSERT INTO public.jarvis_goal_priorities");
    expect(migration).toContain("g.status = 'active'::text");
    expect(migration).toContain("ON CONFLICT (user_id, domain, goal_type) DO UPDATE");
  });

  it("creates set and clear priority RPCs with validation", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.set_jarvis_goal_priority");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.clear_jarvis_goal_priority");
    expect(migration).toContain("'goal_not_active'");
  });

  it("updates metadata RPC for description, notes, and target_date", () => {
    expect(migration).toContain("p_notes text DEFAULT NULL");
    expect(migration).toContain("p_target_date date DEFAULT NULL");
    expect(migration).toContain("p_clear_target_date boolean DEFAULT false");
  });

  it("updates create goal RPC for notes, target_date, and task due_at", () => {
    expect(migration).toContain("p_notes text DEFAULT NULL");
    expect(migration).toContain("p_target_date date DEFAULT NULL");
    expect(migration).toContain("due_at");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.set_jarvis_goal_task_due_at");
  });

  it("clears priority rows when goals complete and keeps tasks.due_at nullable", () => {
    expect(migration).toContain("jarvis_internal.clear_jarvis_goal_priority_for_goal");
    expect(migration).toContain("DELETE FROM public.jarvis_goal_priorities");
    expect(migration).not.toContain("ADD COLUMN IF NOT EXISTS due_at");
  });
});
