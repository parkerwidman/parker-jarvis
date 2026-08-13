import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260812180100_drop_legacy_update_jarvis_goal_metadata_overload.sql";

describe("drop legacy update_jarvis_goal_metadata overload migration", () => {
  const migration = readFileSync(MIGRATION_PATH, "utf8");

  it("drops the pre-D4.1 four-argument metadata RPC", () => {
    expect(migration).toContain(
      "DROP FUNCTION IF EXISTS public.update_jarvis_goal_metadata(uuid, text, text, text)",
    );
  });
});
