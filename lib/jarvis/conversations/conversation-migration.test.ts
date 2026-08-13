import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("J8.1 main conversation migration", () => {
  const migrationSql = readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20260813130000_add_main_jarvis_persistent_conversations.sql",
    ),
    "utf8",
  );

  it("allows main chat thread type and preserves melusi thread types", () => {
    expect(migrationSql).toContain("thread_type = 'chat'::text");
    expect(migrationSql).toContain("agent_key = 'main'::text");
    expect(migrationSql).toContain("'command'::text, 'research'::text, 'campaign'::text");
  });

  it("adds a main active conversation activity index", () => {
    expect(migrationSql).toContain("agent_threads_main_active_activity_idx");
  });

  it("does not weaken RLS", () => {
    expect(migrationSql).not.toContain("DISABLE ROW LEVEL SECURITY");
    expect(migrationSql).not.toContain("GRANT");
    expect(migrationSql).not.toContain("REVOKE");
    expect(migrationSql).not.toContain("DROP TABLE");
    expect(migrationSql).not.toContain("TRUNCATE");
  });

  it("rejects invalid main and melusi thread type combinations in the check constraint", () => {
    expect(migrationSql).toContain(
      "agent_key = 'main'::text\n        AND thread_type = 'chat'::text",
    );
    expect(migrationSql).toContain(
      "agent_key = 'melusi'::text\n        AND thread_type = ANY (ARRAY['command'::text, 'research'::text, 'campaign'::text])",
    );
    expect(migrationSql.match(/thread_type = 'chat'::text/g)?.length).toBe(1);
  });
});
