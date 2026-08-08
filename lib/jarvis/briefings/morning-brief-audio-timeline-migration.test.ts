import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { MORNING_BRIEF_TIMELINE_ERROR_CODE_VALUES } from "@/lib/jarvis/briefings/audio-timeline-types";

const MIGRATION_PATH =
  "supabase/migrations/20260807050000_add_morning_brief_audio_timeline.sql";
const ORIGINAL_MORNING_BRIEFING_MIGRATION =
  "supabase/migrations/20260729203600_add_morning_briefings.sql";

const TIMELINE_COLUMNS = [
  "audio_timeline",
  "audio_timeline_content_hash",
  "audio_duration_ms",
  "audio_timeline_generated_at",
  "audio_timeline_error_code",
  "audio_timeline_model",
] as const;

function readMigration(path: string): string {
  return readFileSync(path, "utf8");
}

describe("morning brief audio timeline migration schema", () => {
  const migration = readMigration(MIGRATION_PATH);
  const originalMigration = readMigration(ORIGINAL_MORNING_BRIEFING_MIGRATION);

  it("adds all six timeline columns to morning_briefings", () => {
    for (const column of TIMELINE_COLUMNS) {
      expect(migration).toContain(`ADD COLUMN ${column}`);
    }
  });

  it("does not store timeline metadata in source_counts", () => {
    expect(migration).not.toContain("source_counts");
  });

  it("requires a coherent timeline state with no partial success fields", () => {
    expect(migration).toContain("morning_briefings_audio_timeline_state_check");
    expect(migration).toContain("audio_timeline IS NULL");
    expect(migration).toContain("audio_timeline_content_hash IS NULL");
    expect(migration).toContain("audio_duration_ms IS NULL");
    expect(migration).toContain("audio_timeline_generated_at IS NULL");
    expect(migration).toContain("audio_timeline_model IS NULL");
    expect(migration).toContain("audio_timeline IS NOT NULL");
    expect(migration).toContain("audio_timeline_content_hash IS NOT NULL");
    expect(migration).toContain("audio_timeline_error_code IS NULL");
  });

  it("requires timeline hash to match non-null audio_content_hash when present", () => {
    expect(migration).toContain("audio_content_hash IS NOT NULL");
    expect(migration).toContain("audio_timeline_content_hash = audio_content_hash");
    expect(migration).not.toContain("audio_content_hash IS NULL");
  });

  it("forbids timeline success fields and error code from coexisting", () => {
    expect(migration).toContain("audio_timeline_error_code IS NULL");
    expect(migration).not.toContain("morning_briefings_audio_timeline_ready_fields_check");
    expect(migration).not.toContain("morning_briefings_audio_timeline_hash_match_check");
  });

  it("constrains audio_timeline_content_hash to lowercase SHA-256 hex", () => {
    expect(migration).toContain("morning_briefings_audio_timeline_content_hash_check");
    expect(migration).toMatch(/audio_timeline_content_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
  });

  it("requires positive audio_duration_ms values", () => {
    expect(migration).toContain("morning_briefings_audio_duration_ms_check");
    expect(migration).toContain("audio_duration_ms > 0");
  });

  it("allows only sanitized timeline error codes in the no-timeline state", () => {
    expect(migration).toContain(
      "morning_briefings_audio_timeline_error_code_values_check",
    );

    for (const errorCode of MORNING_BRIEF_TIMELINE_ERROR_CODE_VALUES) {
      expect(migration).toContain(`'${errorCode}'::text`);
    }
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
