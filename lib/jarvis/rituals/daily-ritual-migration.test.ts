import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260807040000_add_jarvis_daily_rituals.sql";

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

describe("jarvis daily rituals migration schema", () => {
  const migration = readMigration();

  it("creates jarvis_daily_rituals with the required columns", () => {
    expect(migration).toContain("CREATE TABLE public.jarvis_daily_rituals");
    expect(migration).toContain("user_id        uuid                     NOT NULL");
    expect(migration).toContain("ritual_date    date                     NOT NULL");
    expect(migration).toContain("timezone       text                     NOT NULL");
    expect(migration).toContain("status         text                     NOT NULL");
    expect(migration).toContain("briefing_date  date");
    expect(migration).toContain("started_at     timestamp with time zone");
    expect(migration).toContain("completed_at   timestamp with time zone");
    expect(migration).toContain(
      "created_at     timestamp with time zone DEFAULT now() NOT NULL",
    );
    expect(migration).toContain(
      "updated_at     timestamp with time zone DEFAULT now() NOT NULL",
    );
  });

  it("uses a composite primary key on user_id and ritual_date", () => {
    expect(migration).toContain(
      "ADD CONSTRAINT jarvis_daily_rituals_pkey PRIMARY KEY (user_id, ritual_date)",
    );
  });

  it("references auth.users with cascade delete", () => {
    expect(migration).toContain(
      "ADD CONSTRAINT jarvis_daily_rituals_user_id_fkey",
    );
    expect(migration).toContain(
      "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE",
    );
  });

  it("restricts status to started and completed with state checks", () => {
    expect(migration).toContain("jarvis_daily_rituals_status_check");
    expect(migration).toContain("'started'::text");
    expect(migration).toContain("'completed'::text");
    expect(migration).toContain("jarvis_daily_rituals_state_check");
    expect(migration).toContain("status = 'started'::text");
    expect(migration).toContain("started_at IS NOT NULL");
    expect(migration).toContain("completed_at IS NULL");
    expect(migration).toContain("status = 'completed'::text");
    expect(migration).toContain("completed_at IS NOT NULL");
  });

  it("requires a nonblank timezone", () => {
    expect(migration).toContain("jarvis_daily_rituals_timezone_check");
    expect(migration).toContain("btrim(timezone) <> ''::text");
  });

  it("enables RLS with authenticated self-access only", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain(
      'CREATE POLICY "Users manage their own daily rituals"',
    );
    expect(migration).toContain("TO authenticated");
    expect(migration).toContain("auth.uid() AS uid) = user_id");
    expect(migration).not.toMatch(/GRANT.*TO anon/i);
    expect(migration).not.toContain("DELETE ON public.jarvis_daily_rituals");
  });

  it("does not duplicate morning briefing audio fields", () => {
    expect(migration).not.toContain("audio_status");
    expect(migration).not.toContain("audio_content_hash");
    expect(migration).not.toContain("audio_storage_path");
  });
});
