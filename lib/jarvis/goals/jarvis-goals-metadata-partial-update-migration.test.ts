import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260812180200_fix_jarvis_goal_metadata_partial_updates.sql";

describe("fix jarvis goal metadata partial updates migration", () => {
  const migration = readFileSync(MIGRATION_PATH, "utf8");

  it("loads existing domain and goal_type into next-value variables before partial updates", () => {
    expect(migration).toMatch(
      /INTO[\s\S]*v_next_domain,\s*v_next_goal_type[\s\S]*FROM public\.jarvis_goals/,
    );
    expect(migration).toContain("v_old_domain := v_next_domain;");
    expect(migration).toContain("v_old_goal_type := v_next_goal_type;");
  });

  it("preserves the eight-parameter metadata RPC signature", () => {
    expect(migration).toContain("p_target_date date DEFAULT NULL");
    expect(migration).toContain("p_clear_target_date boolean DEFAULT false");
    expect(migration).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.update_jarvis_goal_metadata\([\s\S]*?\)\s*RETURNS[\s\S]*CREATE OR REPLACE FUNCTION public\.update_jarvis_goal_metadata/,
    );
  });

  it("updates target date only when explicitly supplied or cleared", () => {
    expect(migration).toContain("IF p_clear_target_date THEN");
    expect(migration).toContain("ELSIF p_target_date IS NOT NULL THEN");
    expect(migration).toContain("v_next_target_date := p_target_date;");
  });

  it("treats omitted description and notes as unchanged while empty string clears", () => {
    expect(migration).toContain("v_description_provided boolean := p_description IS NOT NULL;");
    expect(migration).toContain("v_notes_provided boolean := p_notes IS NOT NULL;");
    expect(migration).toContain("nullif(trim(coalesce(p_description, '')), '')");
    expect(migration).toContain("nullif(trim(coalesce(p_notes, '')), '')");
  });
});
