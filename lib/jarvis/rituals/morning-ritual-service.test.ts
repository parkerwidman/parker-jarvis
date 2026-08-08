import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  MORNING_BRIEF_AUDIO_TIMELINE_VERSION,
} from "@/lib/jarvis/briefings/audio-timeline-types";
import { computeTtsContentHash } from "@/lib/jarvis/audio/content-hash";
import {
  DEFAULT_TTS_FORMAT,
  MORNING_BRIEF_TTS_INSTRUCTION_VERSION,
  resolveMorningBriefTtsConfig,
} from "@/lib/jarvis/audio/tts-config";
import { segmentMorningBriefSentences } from "@/lib/jarvis/briefings/segment-morning-brief-sentences";
import type { MorningBriefingRowForRitual } from "@/lib/jarvis/rituals/morning-ritual-briefing";
import {
  completeMorningRitual,
  startMorningRitual,
} from "@/lib/jarvis/rituals/morning-ritual-service";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const RITUAL_DATE = "2026-08-07";
const BRIEFING_DATE = "2026-08-07";
const ALT_BRIEFING_DATE = "2026-08-06";
const FIXED_NOW = new Date("2026-08-07T14:30:00.000Z");
const TRANSCRIPT =
  "Good morning, Parker. Your top priority is finishing the proposal. You have two meetings today. Personal mode makes the most sense this morning. Have a focused day.";

type RitualRow = {
  user_id: string;
  ritual_date: string;
  timezone: string;
  status: "started" | "completed";
  briefing_date: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  user_id: string;
  timezone: string | null;
};

function expectedContentHash(text = TRANSCRIPT) {
  const config = resolveMorningBriefTtsConfig();
  return computeTtsContentHash({
    text,
    model: config.model,
    voice: config.voice,
    format: DEFAULT_TTS_FORMAT,
    instructionVersion: MORNING_BRIEF_TTS_INSTRUCTION_VERSION,
  });
}

function createReadyBriefingRow(
  briefingDate = BRIEFING_DATE,
  overrides: Partial<MorningBriefingRowForRitual> = {},
): MorningBriefingRowForRitual {
  const contentHash = expectedContentHash();
  const sentences = segmentMorningBriefSentences(TRANSCRIPT);

  return {
    briefing_date: briefingDate,
    status: "completed",
    content: TRANSCRIPT,
    audio_status: "ready",
    audio_generated_at: "2026-08-07T12:00:00.000Z",
    audio_content_hash: contentHash,
    audio_timeline: {
      version: MORNING_BRIEF_AUDIO_TIMELINE_VERSION,
      sentences: sentences.map((text, index) => ({
        index,
        text,
        startMs: index * 5000,
        endMs: index * 5000 + 4800,
      })),
    },
    audio_timeline_content_hash: contentHash,
    audio_duration_ms: 25320,
    audio_timeline_generated_at: "2026-08-07T12:05:00.000Z",
    audio_timeline_model: "whisper-1",
    audio_timeline_error_code: null,
    recommended_mode: null,
    recommendation_sentence_index: null,
    ...overrides,
  };
}

function createRitualStore(options?: {
  profileTimezone?: string | null;
  initialRitualRows?: RitualRow[];
  briefingRows?: MorningBriefingRowForRitual[];
  simulateInsertFailure?: boolean;
}) {
  const profiles = new Map<string, ProfileRow>([
    [
      USER_ID,
      {
        user_id: USER_ID,
        timezone: options?.profileTimezone ?? "America/Chicago",
      },
    ],
  ]);
  const rituals = new Map<string, RitualRow>();
  const briefings = new Map<string, MorningBriefingRowForRitual>();

  for (const row of options?.initialRitualRows ?? []) {
    rituals.set(`${row.user_id}:${row.ritual_date}`, { ...row });
  }

  for (const row of options?.briefingRows ?? [createReadyBriefingRow()]) {
    briefings.set(`${USER_ID}:${row.briefing_date}`, { ...row });
  }

  let insertFailure = options?.simulateInsertFailure ?? false;
  const insertCalls: Array<Record<string, unknown>> = [];

  const supabase = {
    from(table: string) {
      if (table === "jarvis_profiles") {
        return {
          select() {
            return {
              eq(column: string, value: string) {
                return {
                  maybeSingle: async () => {
                    if (column !== "user_id") {
                      return { data: null, error: null };
                    }

                    return {
                      data: profiles.get(value) ?? null,
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "morning_briefings") {
        const state = {
          filters: {} as Record<string, string>,
          operation: "select" as "select",
          order: null as { column: string; ascending: boolean } | null,
          limit: null as number | null,
        };

        const findBriefing = (): MorningBriefingRowForRitual | null => {
          const userId = state.filters.user_id;
          const briefingDate = state.filters.briefing_date;

          if (userId && briefingDate) {
            return briefings.get(`${userId}:${briefingDate}`) ?? null;
          }

          if (
            userId &&
            state.filters.status === "completed" &&
            state.order?.column === "briefing_date"
          ) {
            const rows = [...briefings.values()]
              .filter(
                (row) =>
                  row.status === "completed" &&
                  Boolean(row.content?.trim()),
              )
              .sort((a, b) =>
                state.order!.ascending
                  ? a.briefing_date.localeCompare(b.briefing_date)
                  : b.briefing_date.localeCompare(a.briefing_date),
              );

            return rows[0] ?? null;
          }

          return null;
        };

        const builder = {
          select() {
            return builder;
          },
          eq(column: string, value: string) {
            state.filters[column] = value;
            return builder;
          },
          not(column: string, operator: string, value: unknown) {
            if (column === "content" && operator === "is" && value === null) {
              state.filters.content_not_null = "true";
            }
            return builder;
          },
          order(column: string, options?: { ascending?: boolean }) {
            state.order = {
              column,
              ascending: options?.ascending ?? true,
            };
            return builder;
          },
          limit(count: number) {
            state.limit = count;
            return builder;
          },
          maybeSingle: async () => ({
            data: findBriefing(),
            error: null,
          }),
        };

        return builder;
      }

      if (table !== "jarvis_daily_rituals") {
        throw new Error(`unexpected table ${table}`);
      }

      const state = {
        filters: {} as Record<string, string | null | boolean>,
        mutation: null as Record<string, unknown> | null,
        operation: "select" as "select" | "insert" | "update",
      };

      const findRitual = (): RitualRow | null => {
        const userId = state.filters.user_id as string | undefined;
        const ritualDate = state.filters.ritual_date as string | undefined;

        if (!userId || !ritualDate) {
          return null;
        }

        return rituals.get(`${userId}:${ritualDate}`) ?? null;
      };

      const builder = {
        select() {
          return builder;
        },
        insert(payload: Record<string, unknown>) {
          state.operation = "insert";
          state.mutation = payload;
          insertCalls.push(payload);
          return builder;
        },
        update(payload: Record<string, unknown>) {
          state.operation = "update";
          state.mutation = payload;
          return builder;
        },
        eq(column: string, value: string) {
          state.filters[column] = value;
          return builder;
        },
        is(column: string, value: null) {
          if (column === "briefing_date" && value === null) {
            state.filters.requireNullBriefingDate = true;
          }
          return builder;
        },
        maybeSingle: async () => {
          if (state.operation === "insert") {
            const payload = state.mutation!;
            const key = `${payload.user_id}:${payload.ritual_date}`;

            if (insertFailure) {
              return {
                data: null,
                error: { code: "XX000", message: "insert failed" },
              };
            }

            if (rituals.has(key)) {
              return {
                data: null,
                error: { code: "23505", message: "duplicate key value" },
              };
            }

            const row: RitualRow = {
              user_id: payload.user_id as string,
              ritual_date: payload.ritual_date as string,
              timezone: payload.timezone as string,
              status: payload.status as RitualRow["status"],
              briefing_date: (payload.briefing_date as string | null) ?? null,
              started_at: payload.started_at as string,
              completed_at: (payload.completed_at as string | null) ?? null,
              created_at: payload.started_at as string,
              updated_at: payload.started_at as string,
            };
            rituals.set(key, row);

            return { data: { ...row }, error: null };
          }

          if (state.operation === "update") {
            const row = findRitual();

            if (!row) {
              return { data: null, error: null };
            }

            if (state.filters.status && row.status !== state.filters.status) {
              return { data: null, error: null };
            }

            if (
              state.filters.requireNullBriefingDate &&
              row.briefing_date !== null
            ) {
              return { data: null, error: null };
            }

            const mutation = state.mutation!;
            if (typeof mutation.status === "string") {
              row.status = mutation.status as RitualRow["status"];
            }
            if ("completed_at" in mutation) {
              row.completed_at = mutation.completed_at as string | null;
            }
            if ("briefing_date" in mutation) {
              row.briefing_date = mutation.briefing_date as string | null;
            }
            row.updated_at = FIXED_NOW.toISOString();

            return { data: { ...row }, error: null };
          }

          const row = findRitual();
          return { data: row ? { ...row } : null, error: null };
        },
      };

      return builder;
    },
  };

  return {
    supabase: supabase as unknown as SupabaseClient,
    rituals,
    briefings,
    insertCalls,
  };
}

describe("startMorningRitual", () => {
  it("rejects malformed briefing dates", async () => {
    const { supabase } = createRitualStore();

    const result = await startMorningRitual({
      supabase,
      userId: USER_ID,
      briefingDate: "08-07-2026",
      now: FIXED_NOW,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("invalid_request");
  });

  it("requires an owned completed ready briefing before mutation", async () => {
    const { supabase } = createRitualStore({
      briefingRows: [
        createReadyBriefingRow(BRIEFING_DATE, {
          status: "generating",
          content: null,
        }),
      ],
    });

    const result = await startMorningRitual({
      supabase,
      userId: USER_ID,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("briefing_not_ready");
  });

  it("rejects audio-not-ready and timeline-missing briefings", async () => {
    const { supabase: audioNotReady } = createRitualStore({
      briefingRows: [createReadyBriefingRow(BRIEFING_DATE, { audio_status: "pending" })],
    });
    const { supabase: timelineMissing } = createRitualStore({
      briefingRows: [
        createReadyBriefingRow(BRIEFING_DATE, {
          audio_timeline: null,
          audio_timeline_content_hash: null,
        }),
      ],
    });

    const audioResult = await startMorningRitual({
      supabase: audioNotReady,
      userId: USER_ID,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });
    const timelineResult = await startMorningRitual({
      supabase: timelineMissing,
      userId: USER_ID,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(audioResult.success).toBe(false);
    expect(timelineResult.success).toBe(false);
  });

  it("creates a started ritual and binds the exact briefing date", async () => {
    const { supabase, rituals, insertCalls } = createRitualStore();

    const result = await startMorningRitual({
      supabase,
      userId: USER_ID,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(result.success).toBe(true);
    if (!result.success || result.result !== "started") return;

    expect(result.created).toBe(true);
    expect(result.bound).toBe(true);
    expect(result.ritual.status).toBe("started");
    expect(result.ritual.briefingDate).toBe(BRIEFING_DATE);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.briefing_date).toBe(BRIEFING_DATE);
    expect(rituals.get(`${USER_ID}:${RITUAL_DATE}`)?.briefing_date).toBe(
      BRIEFING_DATE,
    );
    expect(result.ritual).not.toHaveProperty("userId");
  });

  it("does not leave a brand-new started ritual with a null briefing binding", async () => {
    const { supabase, insertCalls } = createRitualStore();

    await startMorningRitual({
      supabase,
      userId: USER_ID,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.briefing_date).toBe(BRIEFING_DATE);
  });

  it("creates no ritual when the bound insert fails", async () => {
    const { supabase, rituals } = createRitualStore({
      simulateInsertFailure: true,
    });

    const result = await startMorningRitual({
      supabase,
      userId: USER_ID,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("unavailable");
    expect(rituals.size).toBe(0);
  });

  it("binds a legacy started ritual with a null briefing_date", async () => {
    const startedAt = "2026-08-07T08:00:00.000Z";
    const { supabase, rituals, insertCalls } = createRitualStore({
      initialRitualRows: [
        {
          user_id: USER_ID,
          ritual_date: RITUAL_DATE,
          timezone: "America/Chicago",
          status: "started",
          briefing_date: null,
          started_at: startedAt,
          completed_at: null,
          created_at: startedAt,
          updated_at: startedAt,
        },
      ],
    });

    const result = await startMorningRitual({
      supabase,
      userId: USER_ID,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(result.success).toBe(true);
    if (!result.success || result.result !== "started") return;

    expect(result.created).toBe(false);
    expect(result.bound).toBe(true);
    expect(insertCalls).toHaveLength(0);
    expect(rituals.get(`${USER_ID}:${RITUAL_DATE}`)?.briefing_date).toBe(
      BRIEFING_DATE,
    );
  });

  it("is idempotent when the same briefing is already bound", async () => {
    const startedAt = "2026-08-07T08:00:00.000Z";
    const { supabase, rituals } = createRitualStore({
      initialRitualRows: [
        {
          user_id: USER_ID,
          ritual_date: RITUAL_DATE,
          timezone: "America/Chicago",
          status: "started",
          briefing_date: BRIEFING_DATE,
          started_at: startedAt,
          completed_at: null,
          created_at: startedAt,
          updated_at: startedAt,
        },
      ],
    });

    const result = await startMorningRitual({
      supabase,
      userId: USER_ID,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.result).toBe("already_started");
    expect(rituals.get(`${USER_ID}:${RITUAL_DATE}`)?.started_at).toBe(startedAt);
  });

  it("does not downgrade a completed ritual", async () => {
    const { supabase, rituals } = createRitualStore({
      initialRitualRows: [
        {
          user_id: USER_ID,
          ritual_date: RITUAL_DATE,
          timezone: "America/Chicago",
          status: "completed",
          briefing_date: BRIEFING_DATE,
          started_at: "2026-08-07T08:00:00.000Z",
          completed_at: "2026-08-07T08:30:00.000Z",
          created_at: "2026-08-07T08:00:00.000Z",
          updated_at: "2026-08-07T08:30:00.000Z",
        },
      ],
    });

    const result = await startMorningRitual({
      supabase,
      userId: USER_ID,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.result).toBe("already_completed");
    expect(rituals.get(`${USER_ID}:${RITUAL_DATE}`)?.status).toBe("completed");
  });

  it("rejects binding a different briefing date on an already-started ritual", async () => {
    const { supabase } = createRitualStore({
      initialRitualRows: [
        {
          user_id: USER_ID,
          ritual_date: RITUAL_DATE,
          timezone: "America/Chicago",
          status: "started",
          briefing_date: ALT_BRIEFING_DATE,
          started_at: "2026-08-07T08:00:00.000Z",
          completed_at: null,
          created_at: "2026-08-07T08:00:00.000Z",
          updated_at: "2026-08-07T08:00:00.000Z",
        },
      ],
      briefingRows: [
        createReadyBriefingRow(BRIEFING_DATE),
        createReadyBriefingRow(ALT_BRIEFING_DATE),
      ],
    });

    const result = await startMorningRitual({
      supabase,
      userId: USER_ID,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("briefing_mismatch");
  });
});

describe("completeMorningRitual", () => {
  it("rejects completing a nonexistent ritual", async () => {
    const { supabase } = createRitualStore();

    const result = await completeMorningRitual({
      supabase,
      userId: USER_ID,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("not_started");
  });

  it("requires the exact bound briefing date", async () => {
    const { supabase } = createRitualStore({
      initialRitualRows: [
        {
          user_id: USER_ID,
          ritual_date: RITUAL_DATE,
          timezone: "America/Chicago",
          status: "started",
          briefing_date: BRIEFING_DATE,
          started_at: "2026-08-07T08:00:00.000Z",
          completed_at: null,
          created_at: "2026-08-07T08:00:00.000Z",
          updated_at: "2026-08-07T08:00:00.000Z",
        },
      ],
    });

    const result = await completeMorningRitual({
      supabase,
      userId: USER_ID,
      briefingDate: ALT_BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("briefing_mismatch");
  });

  it("completes a started ritual and preserves immutable fields", async () => {
    const startedAt = "2026-08-07T08:00:00.000Z";
    const { supabase, rituals } = createRitualStore({
      initialRitualRows: [
        {
          user_id: USER_ID,
          ritual_date: RITUAL_DATE,
          timezone: "America/Chicago",
          status: "started",
          briefing_date: BRIEFING_DATE,
          started_at: startedAt,
          completed_at: null,
          created_at: startedAt,
          updated_at: startedAt,
        },
      ],
    });

    const result = await completeMorningRitual({
      supabase,
      userId: USER_ID,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(result.success).toBe(true);
    if (!result.success || result.result !== "completed") return;

    const row = rituals.get(`${USER_ID}:${RITUAL_DATE}`);
    expect(row?.status).toBe("completed");
    expect(row?.started_at).toBe(startedAt);
    expect(row?.timezone).toBe("America/Chicago");
    expect(row?.briefing_date).toBe(BRIEFING_DATE);
    expect(result.ritual.completedAt).toBe(FIXED_NOW.toISOString());
  });

  it("is idempotent when already completed", async () => {
    const startedAt = "2026-08-07T08:00:00.000Z";
    const completedAt = "2026-08-07T08:30:00.000Z";
    const { supabase } = createRitualStore({
      initialRitualRows: [
        {
          user_id: USER_ID,
          ritual_date: RITUAL_DATE,
          timezone: "America/Chicago",
          status: "completed",
          briefing_date: BRIEFING_DATE,
          started_at: startedAt,
          completed_at: completedAt,
          created_at: startedAt,
          updated_at: completedAt,
        },
      ],
    });

    const result = await completeMorningRitual({
      supabase,
      userId: USER_ID,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.result).toBe("already_completed");
    expect(result.ritual.startedAt).toBe(startedAt);
    expect(result.ritual.completedAt).toBe(completedAt);
  });
});
