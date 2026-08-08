import { beforeEach, describe, expect, it, vi } from "vitest";
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
  loadMorningRitualEntry,
  resolveMorningRitualDisplayName,
} from "@/lib/jarvis/rituals/load-morning-ritual-entry";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const FIXED_NOW = new Date("2026-08-07T14:30:00.000Z");
const TRANSCRIPT =
  "Good morning, Parker. Your top priority is finishing the proposal. You have two meetings today. Personal mode makes the most sense this morning. Have a focused day.";

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
  briefingDate = "2026-08-07",
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
  preferred_name: string | null;
  timezone: string | null;
};

function createRitualStore(options?: {
  profile?: Partial<ProfileRow>;
  initialRows?: RitualRow[];
  briefingRows?: MorningBriefingRowForRitual[];
  trackMutations?: boolean;
}) {
  const profiles = new Map<string, ProfileRow>([
    [
      USER_ID,
      {
        user_id: USER_ID,
        preferred_name: options?.profile?.preferred_name ?? "Alex",
        timezone: options?.profile?.timezone ?? "America/Chicago",
      },
    ],
  ]);
  const rituals = new Map<string, RitualRow>();
  const briefings = new Map<string, MorningBriefingRowForRitual>();
  const insertCalls: Array<Record<string, unknown>> = [];
  const updateCalls: Array<Record<string, unknown>> = [];

  for (const row of options?.initialRows ?? []) {
    rituals.set(`${row.user_id}:${row.ritual_date}`, { ...row });
  }

  for (const row of options?.briefingRows ?? []) {
    briefings.set(`${USER_ID}:${row.briefing_date}`, { ...row });
  }

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
          order: null as { column: string; ascending: boolean } | null,
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
            return [...briefings.values()]
              .filter(
                (row) =>
                  row.status === "completed" && Boolean(row.content?.trim()),
              )
              .sort((a, b) =>
                state.order!.ascending
                  ? a.briefing_date.localeCompare(b.briefing_date)
                  : b.briefing_date.localeCompare(a.briefing_date),
              )[0] ?? null;
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
          not() {
            return builder;
          },
          order(column: string, options?: { ascending?: boolean }) {
            state.order = {
              column,
              ascending: options?.ascending ?? true,
            };
            return builder;
          },
          limit() {
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
        filters: {} as Record<string, string>,
        operation: "select" as "select" | "insert" | "update",
        mutation: null as Record<string, unknown> | null,
      };

      const findRow = (): RitualRow | null => {
        const userId = state.filters.user_id;
        const ritualDate = state.filters.ritual_date;

        if (!userId || !ritualDate) {
          return null;
        }

        return rituals.get(`${userId}:${ritualDate}`) ?? null;
      };

      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: string) {
          state.filters[column] = value;
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
          updateCalls.push(payload);
          return builder;
        },
        maybeSingle: async () => {
          if (state.operation === "insert") {
            return { data: null, error: null };
          }

          if (state.operation === "update") {
            return { data: null, error: null };
          }

          return {
            data: findRow(),
            error: null,
          };
        },
      };

      return builder;
    },
  };

  return {
    supabase: supabase as unknown as SupabaseClient,
    insertCalls,
    updateCalls,
    rituals,
  };
}

function createStartedRow(briefingDate: string | null = null): RitualRow {
  return {
    user_id: USER_ID,
    ritual_date: "2026-08-07",
    timezone: "America/Chicago",
    status: "started",
    briefing_date: briefingDate,
    started_at: "2026-08-07T08:00:00.000Z",
    completed_at: null,
    created_at: "2026-08-07T08:00:00.000Z",
    updated_at: "2026-08-07T08:00:00.000Z",
  };
}

function createCompletedRow(briefingDate: string | null = "2026-08-07"): RitualRow {
  return {
    user_id: USER_ID,
    ritual_date: "2026-08-07",
    timezone: "America/Chicago",
    status: "completed",
    briefing_date: briefingDate,
    started_at: "2026-08-07T08:00:00.000Z",
    completed_at: "2026-08-07T08:30:00.000Z",
    created_at: "2026-08-07T08:00:00.000Z",
    updated_at: "2026-08-07T08:30:00.000Z",
  };
}

describe("resolveMorningRitualDisplayName", () => {
  it("prefers trimmed profile preferred_name", () => {
    expect(resolveMorningRitualDisplayName("  Alex  ", "owner@example.com")).toBe(
      "Alex",
    );
  });

  it("falls back to the email local part when preferred_name is missing", () => {
    expect(resolveMorningRitualDisplayName(null, "owner@example.com")).toBe(
      "owner",
    );
  });

  it("uses a neutral fallback when profile and email are unavailable", () => {
    expect(resolveMorningRitualDisplayName(null, null)).toBe("there");
  });

  it("does not hardcode Parker in domain logic", () => {
    expect(resolveMorningRitualDisplayName(null, null)).not.toBe("Parker");
  });
});

describe("loadMorningRitualEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns full_required and not_started when no ritual row exists", async () => {
    const { supabase } = createRitualStore();

    const entry = await loadMorningRitualEntry({
      supabase,
      userId: USER_ID,
      email: "owner@example.com",
      now: FIXED_NOW,
    });

    expect(entry.ritualState).toBe("full_required");
    expect(entry.ritualStatus).toBe("not_started");
    expect(entry.briefingDate).toBeNull();
  });

  it("returns full_required and started when ritual is started", async () => {
    const { supabase } = createRitualStore({
      initialRows: [createStartedRow()],
    });

    const entry = await loadMorningRitualEntry({
      supabase,
      userId: USER_ID,
      now: FIXED_NOW,
    });

    expect(entry.ritualState).toBe("full_required");
    expect(entry.ritualStatus).toBe("started");
  });

  it("returns welcome_back and completed when ritual is completed", async () => {
    const { supabase } = createRitualStore({
      initialRows: [createCompletedRow()],
    });

    const entry = await loadMorningRitualEntry({
      supabase,
      userId: USER_ID,
      now: FIXED_NOW,
    });

    expect(entry.ritualState).toBe("welcome_back");
    expect(entry.ritualStatus).toBe("completed");
  });

  it("does not create a ritual row on load", async () => {
    const { supabase, insertCalls } = createRitualStore();

    await loadMorningRitualEntry({
      supabase,
      userId: USER_ID,
      now: FIXED_NOW,
    });

    expect(insertCalls).toHaveLength(0);
  });

  it("does not complete a started ritual on load", async () => {
    const { supabase, updateCalls, rituals } = createRitualStore({
      initialRows: [createStartedRow()],
    });

    await loadMorningRitualEntry({
      supabase,
      userId: USER_ID,
      now: FIXED_NOW,
    });

    expect(updateCalls).toHaveLength(0);
    expect(rituals.get(`${USER_ID}:2026-08-07`)?.status).toBe("started");
  });

  it("does not mutate a completed ritual on load", async () => {
    const completedRow = createCompletedRow("2026-08-07");
    const { supabase, updateCalls, rituals } = createRitualStore({
      initialRows: [completedRow],
    });

    await loadMorningRitualEntry({
      supabase,
      userId: USER_ID,
      now: FIXED_NOW,
    });

    expect(updateCalls).toHaveLength(0);
    expect(rituals.get(`${USER_ID}:2026-08-07`)).toEqual(completedRow);
  });

  it("uses the configured profile timezone for the local ritual date", async () => {
    const { supabase } = createRitualStore({
      profile: {
        timezone: "America/Los_Angeles",
      },
    });

    const entry = await loadMorningRitualEntry({
      supabase,
      userId: USER_ID,
      now: FIXED_NOW,
    });

    expect(entry.timezone).toBe("America/Los_Angeles");
    expect(entry.ritualDate).toBe("2026-08-07");
  });

  it("defaults timezone to America/Chicago when profile timezone is invalid", async () => {
    const { supabase } = createRitualStore({
      profile: {
        timezone: "Not/A_Timezone",
      },
    });

    const entry = await loadMorningRitualEntry({
      supabase,
      userId: USER_ID,
      now: FIXED_NOW,
    });

    expect(entry.timezone).toBe("America/Chicago");
    expect(entry.ritualDate).toBe("2026-08-07");
  });

  it("returns briefingDate when already bound on a started ritual", async () => {
    const { supabase } = createRitualStore({
      initialRows: [createStartedRow("2026-08-07")],
    });

    const entry = await loadMorningRitualEntry({
      supabase,
      userId: USER_ID,
      now: FIXED_NOW,
    });

    expect(entry.briefingDate).toBe("2026-08-07");
  });

  it("loads displayName from profile preferred_name", async () => {
    const { supabase } = createRitualStore({
      profile: {
        preferred_name: "Jordan",
      },
    });

    const entry = await loadMorningRitualEntry({
      supabase,
      userId: USER_ID,
      email: "owner@example.com",
      now: FIXED_NOW,
    });

    expect(entry.displayName).toBe("Jordan");
  });

  it("returns no_brief playback readiness when no briefing exists", async () => {
    const { supabase } = createRitualStore();

    const entry = await loadMorningRitualEntry({
      supabase,
      userId: USER_ID,
      now: FIXED_NOW,
    });

    expect(entry.briefing).toBeNull();
    expect(entry.playbackReadiness).toBe("no_brief");
  });

  it("returns no_brief when only a prior-day briefing exists", async () => {
    const { supabase } = createRitualStore({
      briefingRows: [createReadyBriefingRow("2026-08-06")],
    });

    const entry = await loadMorningRitualEntry({
      supabase,
      userId: USER_ID,
      now: FIXED_NOW,
    });

    expect(entry.briefing).toBeNull();
    expect(entry.playbackReadiness).toBe("no_brief");
    expect(entry.briefingDate).toBeNull();
  });

  it("returns ready playback readiness for a same-day briefing row", async () => {
    const { supabase } = createRitualStore({
      briefingRows: [createReadyBriefingRow()],
    });

    const entry = await loadMorningRitualEntry({
      supabase,
      userId: USER_ID,
      now: FIXED_NOW,
    });

    expect(entry.briefing?.briefingDate).toBe("2026-08-07");
    expect(entry.briefing?.timeline?.durationMs).toBe(25320);
    expect(entry.playbackReadiness).toBe("ready");
  });

  it("does not expose a prior-day briefing on a new local day", async () => {
    const newDayNow = new Date("2026-08-08T14:30:00.000Z");
    const { supabase } = createRitualStore({
      briefingRows: [createReadyBriefingRow("2026-08-07")],
    });

    const entry = await loadMorningRitualEntry({
      supabase,
      userId: USER_ID,
      now: newDayNow,
    });

    expect(entry.ritualDate).toBe("2026-08-08");
    expect(entry.briefing).toBeNull();
    expect(entry.playbackReadiness).toBe("no_brief");
  });

  it("does not grant welcome_back for a completed ritual with mismatched briefing_date", async () => {
    const newDayNow = new Date("2026-08-08T14:30:00.000Z");
    const { supabase } = createRitualStore({
      initialRows: [
        {
          user_id: USER_ID,
          ritual_date: "2026-08-08",
          timezone: "America/Chicago",
          status: "completed",
          briefing_date: "2026-08-07",
          started_at: "2026-08-08T08:00:00.000Z",
          completed_at: "2026-08-08T08:30:00.000Z",
          created_at: "2026-08-08T08:00:00.000Z",
          updated_at: "2026-08-08T08:30:00.000Z",
        },
      ],
      briefingRows: [createReadyBriefingRow("2026-08-07")],
    });

    const entry = await loadMorningRitualEntry({
      supabase,
      userId: USER_ID,
      now: newDayNow,
    });

    expect(entry.ritualState).toBe("full_required");
    expect(entry.ritualStatus).toBe("not_started");
    expect(entry.briefingDate).toBeNull();
    expect(entry.briefing).toBeNull();
    expect(entry.playbackReadiness).toBe("no_brief");
  });

  it("keeps welcome_back for a valid same-day completed ritual", async () => {
    const { supabase } = createRitualStore({
      initialRows: [createCompletedRow("2026-08-07")],
      briefingRows: [createReadyBriefingRow()],
    });

    const entry = await loadMorningRitualEntry({
      supabase,
      userId: USER_ID,
      now: FIXED_NOW,
    });

    expect(entry.ritualState).toBe("welcome_back");
    expect(entry.briefing).not.toBeNull();
    expect(entry.playbackReadiness).toBe("ready");
  });

  it("does not expose sensitive briefing fields in the loader payload", async () => {
    const { supabase } = createRitualStore({
      briefingRows: [createReadyBriefingRow()],
    });

    const entry = await loadMorningRitualEntry({
      supabase,
      userId: USER_ID,
      now: FIXED_NOW,
    });

    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain("audio_content_hash");
    expect(serialized).not.toContain("audio_storage_path");
    expect(serialized).not.toContain("user_id");
    expect(serialized).not.toContain("source_counts");
  });

  it("loads the exact bound briefing row for a started ritual", async () => {
    const { supabase } = createRitualStore({
      initialRows: [createStartedRow("2026-08-06")],
      briefingRows: [
        createReadyBriefingRow("2026-08-06", {
          recommended_mode: "personal",
          recommendation_sentence_index: 3,
        }),
        createReadyBriefingRow("2026-08-07", {
          recommended_mode: "melusi",
          recommendation_sentence_index: 3,
        }),
      ],
    });

    const entry = await loadMorningRitualEntry({
      supabase,
      userId: USER_ID,
      now: FIXED_NOW,
    });

    expect(entry.briefingDate).toBe("2026-08-06");
    expect(entry.briefing?.briefingDate).toBe("2026-08-06");
    expect(entry.briefing?.transcript).toBe(TRANSCRIPT);
    expect(entry.briefing?.recommendedMode).toBe("personal");
    expect(entry.briefing?.recommendationSentenceIndex).toBe(3);
    expect(entry.briefing?.timeline?.durationMs).toBe(25320);
  });

  it("does not substitute a newer displayed briefing when bound briefing is missing", async () => {
    const { supabase } = createRitualStore({
      initialRows: [createStartedRow("2026-08-06")],
      briefingRows: [
        createReadyBriefingRow("2026-08-07", {
          recommended_mode: "melusi",
        }),
      ],
    });

    const entry = await loadMorningRitualEntry({
      supabase,
      userId: USER_ID,
      now: FIXED_NOW,
    });

    expect(entry.briefingDate).toBe("2026-08-06");
    expect(entry.briefing).toBeNull();
    expect(entry.playbackReadiness).toBe("no_brief");
  });
});
