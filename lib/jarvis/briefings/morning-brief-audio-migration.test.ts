import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260807020000_add_morning_brief_audio_foundation.sql";
const ORIGINAL_MORNING_BRIEFING_MIGRATION =
  "supabase/migrations/20260729203600_add_morning_briefings.sql";

const AUDIO_COLUMNS = [
  "audio_status",
  "audio_content_hash",
  "audio_storage_path",
  "audio_generated_at",
  "audio_error_code",
  "audio_model",
  "audio_voice",
] as const;

const AUDIO_STATUS_VALUES = [
  "none",
  "pending",
  "generating",
  "ready",
  "failed",
] as const;

const TEN_MEGABYTES = 10 * 1024 * 1024;

function readMigration(path: string): string {
  return readFileSync(path, "utf8");
}

describe("morning brief audio foundation migration schema", () => {
  const migration = readMigration(MIGRATION_PATH);
  const originalMigration = readMigration(ORIGINAL_MORNING_BRIEFING_MIGRATION);

  it("adds all seven audio lifecycle columns to morning_briefings", () => {
    for (const column of AUDIO_COLUMNS) {
      expect(migration).toContain(`ADD COLUMN ${column}`);
    }
  });

  it("defines audio_status default and allowed values", () => {
    expect(migration).toContain("audio_status text DEFAULT 'none'::text NOT NULL");
    expect(migration).toContain("morning_briefings_audio_status_check");

    for (const status of AUDIO_STATUS_VALUES) {
      expect(migration).toContain(`'${status}'::text`);
    }
  });

  it("requires ready-state audio metadata fields", () => {
    expect(migration).toContain("morning_briefings_audio_ready_fields_check");
    expect(migration).toContain("audio_status <> 'ready'::text");
    expect(migration).toContain("audio_content_hash IS NOT NULL");
    expect(migration).toContain("audio_storage_path IS NOT NULL");
    expect(migration).toContain("audio_generated_at IS NOT NULL");
  });

  it("constrains audio_content_hash to lowercase SHA-256 hex", () => {
    expect(migration).toContain("morning_briefings_audio_content_hash_check");
    expect(migration).toMatch(/audio_content_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
  });

  it("creates a private morning-brief-audio bucket with MP3 settings", () => {
    expect(migration).toContain("INSERT INTO storage.buckets");
    expect(migration).toContain("'morning-brief-audio'");
    expect(migration).toContain("false");
    expect(migration).toContain("ARRAY['audio/mpeg']::text[]");
    expect(migration).toContain(String(TEN_MEGABYTES));
    expect(migration).toContain("ON CONFLICT (id) DO UPDATE SET");
    expect(migration).not.toContain("ON CONFLICT (id) DO NOTHING");
    expect(migration).toContain("public = false");
    expect(migration).toContain("file_size_limit = 10485760");
    expect(migration).toContain(
      "allowed_mime_types = ARRAY['audio/mpeg']::text[]",
    );
  });

  it("rejects blank or whitespace-only audio_storage_path and audio_error_code values", () => {
    expect(migration).toContain("morning_briefings_audio_storage_path_check");
    expect(migration).toContain("btrim(audio_storage_path) <> ''::text");
    expect(migration).toContain("morning_briefings_audio_error_code_check");
    expect(migration).toContain("btrim(audio_error_code) <> ''::text");
  });

  it("does not introduce browser-facing storage policies", () => {
    const sqlWithoutComments = migration.replace(/--[^\n]*/g, "");

    expect(sqlWithoutComments).not.toMatch(/CREATE POLICY/i);
    expect(sqlWithoutComments).not.toMatch(/storage\.objects/i);
    expect(migration).not.toMatch(/GRANT.*TO anon/i);
    expect(migration).toContain(
      "browser-facing storage.objects policies are required",
    );
  });

  it("does not remove or replace the existing morning briefing ownership policy", () => {
    expect(migration).not.toMatch(/DROP POLICY/i);
    expect(migration).not.toMatch(/ALTER POLICY/i);
    expect(migration).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(originalMigration).toContain(
      'CREATE POLICY "Users manage their own morning briefings"',
    );
  });
});
