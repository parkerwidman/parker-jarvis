import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260807030000_add_morning_brief_audio_generation_started_at.sql";
const ORIGINAL_MORNING_BRIEFING_MIGRATION =
  "supabase/migrations/20260729203600_add_morning_briefings.sql";

function readMigration(path: string): string {
  return readFileSync(path, "utf8");
}

describe("morning brief audio generation started_at migration schema", () => {
  const migration = readMigration(MIGRATION_PATH);
  const originalMigration = readMigration(ORIGINAL_MORNING_BRIEFING_MIGRATION);

  it("adds audio_generation_started_at to morning_briefings", () => {
    expect(migration).toContain("ADD COLUMN audio_generation_started_at");
  });

  it("defines the named lifecycle constraint for generating timestamps", () => {
    expect(migration).toContain(
      "morning_briefings_audio_generation_started_at_check",
    );
    expect(migration).toContain("audio_status = 'generating'::text");
    expect(migration).toContain("audio_generation_started_at IS NOT NULL");
    expect(migration).toContain("audio_status <> 'generating'::text");
    expect(migration).toContain("audio_generation_started_at IS NULL");
  });

  it("does not alter or remove existing RLS", () => {
    expect(migration).not.toMatch(/DROP POLICY/i);
    expect(migration).not.toMatch(/ALTER POLICY/i);
    expect(migration).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(originalMigration).toContain(
      'CREATE POLICY "Users manage their own morning briefings"',
    );
  });

  it("does not add storage or public browser-facing policies", () => {
    const sqlWithoutComments = migration.replace(/--[^\n]*/g, "");

    expect(sqlWithoutComments).not.toMatch(/CREATE POLICY/i);
    expect(sqlWithoutComments).not.toMatch(/storage\.objects/i);
    expect(migration).not.toMatch(/GRANT.*TO anon/i);
  });
});
