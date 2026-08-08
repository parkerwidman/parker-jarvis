import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bindDailyRitualBriefing,
  completeDailyRitual,
  getDailyRitual,
  resolveUserRitualDate,
  startDailyRitual,
  startDailyRitualWithBriefing,
  type DailyRitual,
} from "@/lib/jarvis/rituals/daily-ritual";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const RITUAL_DATE = "2026-08-07";
const BRIEFING_DATE = "2026-08-07";
const ALT_BRIEFING_DATE = "2026-08-06";
const FIXED_NOW = new Date("2026-08-07T14:30:00.000Z");

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

function cloneRitual(row: RitualRow): RitualRow {
  return { ...row };
}

function createRitualStore(options?: {
  profileTimezone?: string | null;
  initialRows?: RitualRow[];
  simulateInsertRace?: boolean;
  simulateInsertFailure?: boolean;
  simulateBindUpdateFailure?: boolean;
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
  const insertCalls: Array<Record<string, unknown>> = [];

  for (const row of options?.initialRows ?? []) {
    rituals.set(`${row.user_id}:${row.ritual_date}`, cloneRitual(row));
  }

  let insertBlockedOnce = options?.simulateInsertRace ?? false;
  let insertFailure = options?.simulateInsertFailure ?? false;
  let bindUpdateFailure = options?.simulateBindUpdateFailure ?? false;

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

      if (table !== "jarvis_daily_rituals") {
        throw new Error(`unexpected table ${table}`);
      }

      const state = {
        filters: {} as Record<string, string | null | boolean>,
        mutation: null as Record<string, unknown> | null,
        operation: "select" as "select" | "insert" | "update",
      };

      const findRow = (): RitualRow | null => {
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

            if (insertBlockedOnce) {
              insertBlockedOnce = false;
              rituals.set(key, {
                user_id: payload.user_id as string,
                ritual_date: payload.ritual_date as string,
                timezone: payload.timezone as string,
                status: "started",
                briefing_date: (payload.briefing_date as string | null) ?? null,
                started_at: payload.started_at as string,
                completed_at: null,
                created_at: payload.started_at as string,
                updated_at: payload.started_at as string,
              });
              return {
                data: null,
                error: { code: "23505", message: "duplicate key value" },
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

            return { data: row, error: null };
          }

          if (state.operation === "update") {
            const row = findRow();

            if (!row) {
              return { data: null, error: null };
            }

            if (bindUpdateFailure && "briefing_date" in (state.mutation ?? {})) {
              return {
                data: null,
                error: { code: "XX000", message: "update failed" },
              };
            }

            if (
              state.filters.status &&
              row.status !== state.filters.status
            ) {
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

            return { data: cloneRitual(row), error: null };
          }

          const row = findRow();
          return { data: row ? cloneRitual(row) : null, error: null };
        },
      };

      return builder;
    },
  } as unknown as SupabaseClient;

  return {
    supabase,
    rituals,
    insertCalls,
  };
}

describe("daily ritual domain helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no ritual row exists", async () => {
    const { supabase } = createRitualStore();

    await expect(
      getDailyRitual(supabase, USER_ID, RITUAL_DATE, FIXED_NOW),
    ).resolves.toBeNull();
  });

  it("creates a started ritual with started_at and timezone on first start", async () => {
    const { supabase, insertCalls } = createRitualStore({
      profileTimezone: "America/Los_Angeles",
    });

    const result = await startDailyRitual(
      supabase,
      USER_ID,
      RITUAL_DATE,
      FIXED_NOW,
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.created).toBe(true);
    expect(result.ritual.status).toBe("started");
    expect(result.ritual.startedAt).toBe(FIXED_NOW.toISOString());
    expect(result.ritual.timezone).toBe("America/Los_Angeles");
    expect(result.ritual.completedAt).toBeNull();
    expect(insertCalls[0]?.user_id).toBe(USER_ID);
  });

  it("resolves the local ritual date from the configured profile timezone", async () => {
    const { supabase } = createRitualStore({
      profileTimezone: "Pacific/Honolulu",
    });
    const now = new Date("2026-08-07T09:30:00.000Z");

    const resolved = await resolveUserRitualDate(supabase, USER_ID, now);

    expect(resolved.timezone).toBe("Pacific/Honolulu");
    expect(resolved.ritualDate).toBe("2026-08-06");
    expect(resolved.ritualDate).not.toBe(now.toISOString().slice(0, 10));
  });

  it("defaults to America/Chicago when profile timezone is missing or invalid", async () => {
    const { supabase } = createRitualStore({ profileTimezone: "Not/AZone" });

    const resolved = await resolveUserRitualDate(supabase, USER_ID, FIXED_NOW);

    expect(resolved.timezone).toBe("America/Chicago");
  });

  it("is idempotent when starting an already-started ritual", async () => {
    const startedAt = "2026-08-07T08:00:00.000Z";
    const { supabase } = createRitualStore({
      initialRows: [
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

    const first = await startDailyRitual(
      supabase,
      USER_ID,
      RITUAL_DATE,
      FIXED_NOW,
    );
    const second = await startDailyRitual(
      supabase,
      USER_ID,
      RITUAL_DATE,
      FIXED_NOW,
    );

    expect(first.success && first.created).toBe(false);
    expect(second.success && second.created).toBe(false);
    if (first.success && second.success) {
      expect(second.ritual.startedAt).toBe(startedAt);
      expect(second.ritual.status).toBe("started");
    }
  });

  it("does not downgrade a completed ritual when start is called again", async () => {
    const startedAt = "2026-08-07T08:00:00.000Z";
    const completedAt = "2026-08-07T09:00:00.000Z";
    const { supabase } = createRitualStore({
      initialRows: [
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

    const result = await startDailyRitual(
      supabase,
      USER_ID,
      RITUAL_DATE,
      FIXED_NOW,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.ritual.status).toBe("completed");
      expect(result.ritual.completedAt).toBe(completedAt);
      expect(result.ritual.briefingDate).toBe(BRIEFING_DATE);
    }
  });

  it("completes a started ritual and preserves started_at, ritual_date, and timezone", async () => {
    const startedAt = "2026-08-07T08:00:00.000Z";
    const { supabase } = createRitualStore({
      initialRows: [
        {
          user_id: USER_ID,
          ritual_date: RITUAL_DATE,
          timezone: "America/Denver",
          status: "started",
          briefing_date: null,
          started_at: startedAt,
          completed_at: null,
          created_at: startedAt,
          updated_at: startedAt,
        },
      ],
    });

    const result = await completeDailyRitual(
      supabase,
      USER_ID,
      RITUAL_DATE,
      FIXED_NOW,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.ritual.status).toBe("completed");
      expect(result.ritual.startedAt).toBe(startedAt);
      expect(result.ritual.completedAt).toBe(FIXED_NOW.toISOString());
      expect(result.ritual.ritualDate).toBe(RITUAL_DATE);
      expect(result.ritual.timezone).toBe("America/Denver");
    }
  });

  it("is idempotent when completing an already-completed ritual", async () => {
    const startedAt = "2026-08-07T08:00:00.000Z";
    const completedAt = "2026-08-07T09:00:00.000Z";
    const { supabase } = createRitualStore({
      initialRows: [
        {
          user_id: USER_ID,
          ritual_date: RITUAL_DATE,
          timezone: "America/Chicago",
          status: "completed",
          briefing_date: null,
          started_at: startedAt,
          completed_at: completedAt,
          created_at: startedAt,
          updated_at: completedAt,
        },
      ],
    });

    const result = await completeDailyRitual(
      supabase,
      USER_ID,
      RITUAL_DATE,
      FIXED_NOW,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.ritual.completedAt).toBe(completedAt);
    }
  });

  it("does not fabricate completion when the ritual was never started", async () => {
    const { supabase } = createRitualStore();

    const result = await completeDailyRitual(
      supabase,
      USER_ID,
      RITUAL_DATE,
      FIXED_NOW,
    );

    expect(result).toEqual({
      success: false,
      error: "Daily ritual has not been started.",
      code: "not_started",
    });
  });

  it("binds briefing_date on a started ritual", async () => {
    const startedAt = "2026-08-07T08:00:00.000Z";
    const { supabase } = createRitualStore({
      initialRows: [
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

    const result = await bindDailyRitualBriefing({
      supabase,
      userId: USER_ID,
      ritualDate: RITUAL_DATE,
      briefingDate: BRIEFING_DATE,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.bound).toBe(true);
      expect(result.ritual.briefingDate).toBe(BRIEFING_DATE);
    }
  });

  it("accepts binding the same briefing_date idempotently", async () => {
    const startedAt = "2026-08-07T08:00:00.000Z";
    const { supabase } = createRitualStore({
      initialRows: [
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

    const result = await bindDailyRitualBriefing({
      supabase,
      userId: USER_ID,
      ritualDate: RITUAL_DATE,
      briefingDate: BRIEFING_DATE,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.bound).toBe(false);
    }
  });

  it("rejects silently replacing an already-bound briefing_date", async () => {
    const startedAt = "2026-08-07T08:00:00.000Z";
    const { supabase } = createRitualStore({
      initialRows: [
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

    const result = await bindDailyRitualBriefing({
      supabase,
      userId: USER_ID,
      ritualDate: RITUAL_DATE,
      briefingDate: ALT_BRIEFING_DATE,
    });

    expect(result).toEqual({
      success: false,
      error: "Daily ritual already has a different briefing bound.",
      code: "briefing_already_bound",
    });
  });

  it("does not mutate briefing_date on completed rituals", async () => {
    const startedAt = "2026-08-07T08:00:00.000Z";
    const completedAt = "2026-08-07T09:00:00.000Z";
    const { supabase } = createRitualStore({
      initialRows: [
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

    const result = await bindDailyRitualBriefing({
      supabase,
      userId: USER_ID,
      ritualDate: RITUAL_DATE,
      briefingDate: ALT_BRIEFING_DATE,
    });

    expect(result).toEqual({
      success: false,
      error: "Completed daily rituals cannot bind a briefing.",
      code: "already_completed",
    });
  });

  it("resolves concurrent start conflicts to the authoritative row", async () => {
    const { supabase } = createRitualStore({ simulateInsertRace: true });

    const result = await startDailyRitual(
      supabase,
      USER_ID,
      RITUAL_DATE,
      FIXED_NOW,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.created).toBe(false);
      expect(result.ritual.status).toBe("started");
    }

    const loaded = await getDailyRitual(
      supabase,
      USER_ID,
      RITUAL_DATE,
      FIXED_NOW,
    );

    expect(loaded?.status).toBe("started");
  });

  it("uses the server-supplied user id for writes without accepting alternate client ids implicitly", async () => {
    const { supabase, insertCalls } = createRitualStore();

    await startDailyRitual(supabase, USER_ID, RITUAL_DATE, FIXED_NOW);

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.user_id).toBe(USER_ID);
    expect(insertCalls[0]?.user_id).not.toBe(OTHER_USER_ID);

    const ritual = await getDailyRitual(
      supabase,
      OTHER_USER_ID,
      RITUAL_DATE,
      FIXED_NOW,
    );
    expect(ritual).toBeNull();
  });

  it("preserves an existing briefing_date when completing a started ritual", async () => {
    const startedAt = "2026-08-07T08:00:00.000Z";
    const { supabase } = createRitualStore({
      initialRows: [
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

    const result = await completeDailyRitual(
      supabase,
      USER_ID,
      RITUAL_DATE,
      FIXED_NOW,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.ritual as DailyRitual).briefingDate).toBe(BRIEFING_DATE);
    }
  });
});

describe("startDailyRitualWithBriefing", () => {
  it("inserts a started ritual already bound to the briefing in one write", async () => {
    const { supabase, insertCalls, rituals } = createRitualStore();

    const result = await startDailyRitualWithBriefing({
      supabase,
      userId: USER_ID,
      ritualDate: RITUAL_DATE,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.outcome).toBe("created");
    expect(result.ritual.briefingDate).toBe(BRIEFING_DATE);
    expect(result.ritual.status).toBe("started");
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.briefing_date).toBe(BRIEFING_DATE);
    expect(insertCalls[0]?.status).toBe("started");
    expect(rituals.get(`${USER_ID}:${RITUAL_DATE}`)?.briefing_date).toBe(
      BRIEFING_DATE,
    );
  });

  it("does not create a brand-new started ritual with a null briefing binding", async () => {
    const { supabase, insertCalls } = createRitualStore();

    await startDailyRitualWithBriefing({
      supabase,
      userId: USER_ID,
      ritualDate: RITUAL_DATE,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.briefing_date).toBe(BRIEFING_DATE);
    expect(insertCalls[0]?.briefing_date).not.toBeNull();
  });

  it("creates no ritual when the insert fails", async () => {
    const { supabase, rituals, insertCalls } = createRitualStore({
      simulateInsertFailure: true,
    });

    const result = await startDailyRitualWithBriefing({
      supabase,
      userId: USER_ID,
      ritualDate: RITUAL_DATE,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("unavailable");
    expect(insertCalls).toHaveLength(1);
    expect(rituals.size).toBe(0);
  });

  it("is idempotent when concurrent callers start the same briefing", async () => {
    const { supabase } = createRitualStore({ simulateInsertRace: true });

    const result = await startDailyRitualWithBriefing({
      supabase,
      userId: USER_ID,
      ritualDate: RITUAL_DATE,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.outcome).toBe("already_started");
    expect(result.ritual.briefingDate).toBe(BRIEFING_DATE);
  });

  it("returns briefing_mismatch when a concurrent winner bound a different briefing", async () => {
    const startedAt = FIXED_NOW.toISOString();
    const { supabase, rituals } = createRitualStore({
      initialRows: [
        {
          user_id: USER_ID,
          ritual_date: RITUAL_DATE,
          timezone: "America/Chicago",
          status: "started",
          briefing_date: ALT_BRIEFING_DATE,
          started_at: startedAt,
          completed_at: null,
          created_at: startedAt,
          updated_at: startedAt,
        },
      ],
    });

    const result = await startDailyRitualWithBriefing({
      supabase,
      userId: USER_ID,
      ritualDate: RITUAL_DATE,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("briefing_mismatch");
    expect(rituals.get(`${USER_ID}:${RITUAL_DATE}`)?.briefing_date).toBe(
      ALT_BRIEFING_DATE,
    );
  });

  it("never downgrades a completed ritual", async () => {
    const startedAt = "2026-08-07T08:00:00.000Z";
    const completedAt = "2026-08-07T09:00:00.000Z";
    const { supabase, rituals } = createRitualStore({
      initialRows: [
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

    const result = await startDailyRitualWithBriefing({
      supabase,
      userId: USER_ID,
      ritualDate: RITUAL_DATE,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.outcome).toBe("already_completed");
    expect(rituals.get(`${USER_ID}:${RITUAL_DATE}`)?.status).toBe("completed");
  });

  it("conditionally binds a legacy started ritual with a null briefing_date", async () => {
    const startedAt = "2026-08-07T08:00:00.000Z";
    const { supabase, rituals } = createRitualStore({
      initialRows: [
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

    const result = await startDailyRitualWithBriefing({
      supabase,
      userId: USER_ID,
      ritualDate: RITUAL_DATE,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.outcome).toBe("legacy_bound");
    expect(rituals.get(`${USER_ID}:${RITUAL_DATE}`)?.briefing_date).toBe(
      BRIEFING_DATE,
    );
  });

  it("does not overwrite a concurrent non-null briefing binding on legacy rows", async () => {
    const startedAt = "2026-08-07T08:00:00.000Z";
    const { supabase, rituals } = createRitualStore({
      initialRows: [
        {
          user_id: USER_ID,
          ritual_date: RITUAL_DATE,
          timezone: "America/Chicago",
          status: "started",
          briefing_date: ALT_BRIEFING_DATE,
          started_at: startedAt,
          completed_at: null,
          created_at: startedAt,
          updated_at: startedAt,
        },
      ],
    });

    const result = await startDailyRitualWithBriefing({
      supabase,
      userId: USER_ID,
      ritualDate: RITUAL_DATE,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("briefing_mismatch");
    expect(rituals.get(`${USER_ID}:${RITUAL_DATE}`)?.briefing_date).toBe(
      ALT_BRIEFING_DATE,
    );
  });

  it("does not falsely report success when legacy bind update fails", async () => {
    const startedAt = "2026-08-07T08:00:00.000Z";
    const { supabase, rituals } = createRitualStore({
      simulateBindUpdateFailure: true,
      initialRows: [
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

    const result = await startDailyRitualWithBriefing({
      supabase,
      userId: USER_ID,
      ritualDate: RITUAL_DATE,
      briefingDate: BRIEFING_DATE,
      now: FIXED_NOW,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("unavailable");
    expect(rituals.get(`${USER_ID}:${RITUAL_DATE}`)?.briefing_date).toBeNull();
  });
});
