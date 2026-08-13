import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  countMessagesAfterWatermark,
  isMessageAfterWatermark,
} from "@/lib/jarvis/context-engine/conversation-state";

describe("J8.2 conversation state migration", () => {
  const migrationSql = readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20260813140000_add_jarvis_conversation_context_state.sql",
    ),
    "utf8",
  );

  it("creates jarvis_conversation_state with ownership-aware FK", () => {
    expect(migrationSql).toContain("CREATE TABLE public.jarvis_conversation_state");
    expect(migrationSql).toContain("REFERENCES public.agent_threads (id, user_id, agent_key)");
    expect(migrationSql).toContain("ON DELETE CASCADE");
  });

  it("enables RLS for authenticated user ownership", () => {
    expect(migrationSql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migrationSql).toContain("auth.uid()");
    expect(migrationSql).toContain("user_id");
    expect(migrationSql).not.toContain("TO anon");
  });

  it("does not modify prior migrations destructively", () => {
    expect(migrationSql).not.toContain("DROP TABLE");
    expect(migrationSql).not.toContain("TRUNCATE");
    expect(migrationSql).not.toContain("DISABLE ROW LEVEL SECURITY");
  });

  it("requires JSON array columns", () => {
    expect(migrationSql).toContain("jsonb_typeof(unresolved_questions) = 'array'");
    expect(migrationSql).toContain("jsonb_typeof(active_entities) = 'array'");
    expect(migrationSql).toContain("jsonb_typeof(decisions) = 'array'");
  });
});

describe("conversation state watermark helpers", () => {
  it("orders by created_at and id tie-break", () => {
    const watermark = {
      id: "b",
      createdAt: "2026-08-13T12:00:00.000Z",
    };

    expect(
      isMessageAfterWatermark(
        { id: "a", createdAt: "2026-08-13T12:00:00.000Z" },
        watermark,
      ),
    ).toBe(false);

    expect(
      isMessageAfterWatermark(
        { id: "c", createdAt: "2026-08-13T12:00:00.000Z" },
        watermark,
      ),
    ).toBe(true);
  });

  it("counts unsummarized messages after watermark", () => {
    const count = countMessagesAfterWatermark(
      [
        { id: "1", createdAt: "2026-08-13T11:00:00.000Z" },
        { id: "2", createdAt: "2026-08-13T12:00:00.000Z" },
        { id: "3", createdAt: "2026-08-13T13:00:00.000Z" },
      ],
      { id: "2", createdAt: "2026-08-13T12:00:00.000Z" },
    );

    expect(count).toBe(1);
  });
});
