import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAIN_JARVIS_AGENT,
  MELUSI_JARVIS_AGENT,
} from "@/lib/jarvis/agents/agent-registry";
import { BASE_MAIN_JARVIS_INSTRUCTIONS } from "@/lib/jarvis/agents/main-instructions-content";
import { executeJarvisTool } from "@/lib/jarvis/agents/tool-executor";
import { createInteractiveMainJarvisContext } from "@/lib/jarvis/agents/tool-execution-context";
import {
  getToolsForAgent,
  getToolsForGroups,
  MAIN_JARVIS_TOOLS,
  MELUSI_JARVIS_TOOLS,
} from "@/lib/jarvis/agents/tool-definitions";
import {
  collectScheduleConflicts,
  resolveScheduleOccurrences,
} from "@/lib/jarvis/schedule/resolve-schedule-occurrences";
import {
  formatWeekdayName,
  summarizeScheduleBlock,
} from "@/lib/jarvis/schedule/schedule-tool-formatters";
import {
  findScheduleOpenWindowsTool,
  getScheduleForDate,
  getScheduleForWeek,
  getSchedulePeriods,
} from "@/lib/jarvis/schedule/schedule-tools";
import type {
  JarvisSchedule,
  JarvisScheduleItem,
  JarvisScheduleOverride,
} from "@/lib/jarvis/schedule/schedule-types";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

const BASE_SCHEDULE: JarvisSchedule = {
  id: "schedule-1",
  userId: USER_A,
  name: "Fall 2026 — Aug 24 to Oct 18",
  description: null,
  startDate: "2026-08-24",
  endDate: "2026-10-18",
  timezone: "America/Chicago",
  status: "active",
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
};

function makeItem(
  overrides: Partial<JarvisScheduleItem> & Pick<JarvisScheduleItem, "id" | "dayOfWeek" | "title">,
): JarvisScheduleItem {
  return {
    userId: USER_A,
    scheduleId: BASE_SCHEDULE.id,
    effectiveStartDate: overrides.effectiveStartDate ?? "2026-08-24",
    effectiveEndDate: overrides.effectiveEndDate ?? null,
    startTime: overrides.startTime ?? "09:00:00",
    endTime: overrides.endTime !== undefined ? overrides.endTime : "10:00:00",
    category: overrides.category ?? "work",
    notes: overrides.notes ?? null,
    metadata: overrides.metadata ?? {},
    sortOrder: overrides.sortOrder ?? 0,
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

function makeOverride(
  overrides: Partial<JarvisScheduleOverride> &
    Pick<JarvisScheduleOverride, "id" | "overrideType" | "occurrenceDate">,
): JarvisScheduleOverride {
  return {
    userId: USER_A,
    scheduleId: BASE_SCHEDULE.id,
    scheduleItemId: overrides.scheduleItemId ?? null,
    startTime: overrides.startTime ?? null,
    endTime: overrides.endTime ?? null,
    title: overrides.title ?? null,
    category: overrides.category ?? null,
    notes: overrides.notes ?? null,
    metadata: overrides.metadata ?? {},
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

function toScheduleRow(schedule: JarvisSchedule) {
  return {
    id: schedule.id,
    user_id: schedule.userId,
    name: schedule.name,
    description: schedule.description,
    start_date: schedule.startDate,
    end_date: schedule.endDate,
    timezone: schedule.timezone,
    status: schedule.status,
    created_at: schedule.createdAt,
    updated_at: schedule.updatedAt,
  };
}

function toItemRow(item: JarvisScheduleItem) {
  return {
    id: item.id,
    user_id: item.userId,
    schedule_id: item.scheduleId,
    day_of_week: item.dayOfWeek,
    effective_start_date: item.effectiveStartDate,
    effective_end_date: item.effectiveEndDate,
    start_time: item.startTime,
    end_time: item.endTime,
    title: item.title,
    category: item.category,
    notes: item.notes,
    metadata: item.metadata,
    sort_order: item.sortOrder,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

function toOverrideRow(override: JarvisScheduleOverride) {
  return {
    id: override.id,
    user_id: override.userId,
    schedule_id: override.scheduleId,
    schedule_item_id: override.scheduleItemId,
    occurrence_date: override.occurrenceDate,
    override_type: override.overrideType,
    start_time: override.startTime,
    end_time: override.endTime,
    title: override.title,
    category: override.category,
    notes: override.notes,
    metadata: override.metadata,
    created_at: override.createdAt,
    updated_at: override.updatedAt,
  };
}

function buildSupabaseMock(options: {
  schedules?: JarvisSchedule[];
  activeScheduleDate?: string | null;
  items?: JarvisScheduleItem[];
  overrides?: JarvisScheduleOverride[];
}) {
  const schedules = options.schedules ?? [BASE_SCHEDULE];
  const items = options.items ?? [];
  const overrides = options.overrides ?? [];

  function createAwaitableResult(table: string) {
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        filters[column] = value;
        return builder;
      },
      lte(column: string, value: unknown) {
        filters[column] = value;
        return builder;
      },
      gte(column: string, value: unknown) {
        rangeFilters.push({ column, op: "gte", value });
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      maybeSingle: async () => resolveMaybeSingle(table),
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve(resolveList(table)).then(onFulfilled, onRejected);
      },
    };

    const filters: Record<string, unknown> = {};
    const rangeFilters: Array<{ column: string; op: "gte"; value: unknown }> = [];

    async function resolveMaybeSingle(tableName: string) {
      if (tableName === "jarvis_profiles") {
        return { data: { timezone: "America/Chicago" }, error: null };
      }

      if (tableName === "jarvis_schedules") {
        if (filters.user_id === USER_B) {
          return { data: null, error: null };
        }

        if (typeof filters.id === "string") {
          const schedule = schedules.find((entry) => entry.id === filters.id);
          return {
            data: schedule ? toScheduleRow(schedule) : null,
            error: null,
          };
        }

        if (options.activeScheduleDate) {
          const schedule = schedules.find(
            (entry) =>
              entry.startDate <= options.activeScheduleDate! &&
              entry.endDate >= options.activeScheduleDate!,
          );
          return {
            data: schedule ? toScheduleRow(schedule) : null,
            error: null,
          };
        }

        return { data: null, error: null };
      }

      return { data: null, error: null };
    }

    function resolveList(tableName: string) {
      if (tableName === "jarvis_schedule_items") {
        const rows = items
          .filter(
            (item) =>
              item.userId === filters.user_id &&
              item.scheduleId === filters.schedule_id,
          )
          .map(toItemRow);
        return { data: rows, error: null };
      }

      if (tableName === "jarvis_schedule_overrides") {
        const rows = overrides
          .filter(
            (override) =>
              override.userId === filters.user_id &&
              override.scheduleId === filters.schedule_id,
          )
          .map(toOverrideRow);
        return { data: rows, error: null };
      }

      if (tableName === "jarvis_schedules") {
        const rows = schedules
          .filter(
            (schedule) =>
              filters.user_id === undefined || schedule.userId === filters.user_id,
          )
          .map(toScheduleRow);
        return { data: rows, error: null };
      }

      return { data: [], error: null };
    }

    return builder;
  }

  return {
    from(table: string) {
      return createAwaitableResult(table);
    },
  };
}

describe("schedule tool registration", () => {
  it("registers schedule read tools on Main Jarvis only", () => {
    const mainToolNames = MAIN_JARVIS_TOOLS.map((tool) => tool.name);

    expect(mainToolNames).toContain("get_schedule_for_date");
    expect(mainToolNames).toContain("get_schedule_for_week");
    expect(mainToolNames).toContain("get_schedule_periods");
    expect(mainToolNames).toContain("find_schedule_open_windows");
    expect(MAIN_JARVIS_AGENT.toolGroups).toContain("schedule");
  });

  it("does not register schedule tools on Melusi Jarvis", () => {
    const melusiToolNames = MELUSI_JARVIS_TOOLS.map((tool) => tool.name);

    expect(melusiToolNames).not.toContain("get_schedule_for_date");
    expect(melusiToolNames).not.toContain("get_schedule_for_week");
    expect(melusiToolNames).not.toContain("get_schedule_periods");
    expect(melusiToolNames).not.toContain("find_schedule_open_windows");
    expect(MELUSI_JARVIS_AGENT.toolGroups).not.toContain("schedule");
  });

  it("keeps Main Jarvis tool groups aligned with getToolsForAgent", () => {
    expect(getToolsForAgent("main").map((tool) => tool.name)).toEqual(
      getToolsForGroups(MAIN_JARVIS_AGENT.toolGroups).map((tool) => tool.name),
    );
  });

  it("keeps read tools separate from write proposal tools", () => {
    const mainToolNames = MAIN_JARVIS_TOOLS.map((tool) => tool.name);

    expect(mainToolNames).toContain("get_schedule_for_date");
    expect(mainToolNames).toContain("propose_add_schedule_item");
    expect(mainToolNames).not.toContain("jarvis_schedule_add_recurring_item");
  });
});

describe("Main Jarvis schedule instructions", () => {
  it("instructs Jarvis to use schedule tools and distinguish Outlook", () => {
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("Jarvis Schedule");
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("Outlook Calendar");
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("get_schedule_for_date");
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("find_schedule_open_windows");
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("Never guess Jarvis Schedule blocks");
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("consult Jarvis Schedule and Outlook Calendar");
    expect(BASE_MAIN_JARVIS_INSTRUCTIONS).toContain("read-only");
  });
});

describe("schedule read tool domain", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("returns resolved blocks for a normal date", async () => {
    const items = [
      makeItem({
        id: "item-1",
        dayOfWeek: 0,
        title: "Morning Routine",
        startTime: "06:30:00",
        endTime: "08:00:00",
        category: "morning_routine",
      }),
      makeItem({
        id: "item-2",
        dayOfWeek: 0,
        title: "Work Block",
        startTime: "08:00:00",
        endTime: "09:30:00",
        category: "work",
      }),
    ];

    const supabase = buildSupabaseMock({
      activeScheduleDate: "2026-08-24",
      items,
    });

    const result = await getScheduleForDate(supabase as never, USER_A, {
      date: "2026-08-24",
    });

    expect(result.success).toBe(true);
    expect(result.scheduleApplies).toBe(true);
    expect(result.blocks).toEqual([
      expect.objectContaining({ title: "Morning Routine", start: "6:30 AM" }),
      expect.objectContaining({ title: "Work Block", start: "8:00 AM" }),
    ]);
  });

  it("reflects replace overrides and hides skipped occurrences", async () => {
    const items = [
      makeItem({
        id: "item-1",
        dayOfWeek: 0,
        title: "Work Block",
        startTime: "08:00:00",
        endTime: "09:30:00",
      }),
      makeItem({
        id: "item-2",
        dayOfWeek: 0,
        title: "Chest/Back",
        startTime: "09:30:00",
        endTime: "12:00:00",
      }),
    ];
    const overrides = [
      makeOverride({
        id: "override-replace",
        scheduleItemId: "item-1",
        overrideType: "replace",
        occurrenceDate: "2026-08-24",
        title: "Deep Work",
        category: "work",
        startTime: "08:30:00",
        endTime: "10:00:00",
      }),
      makeOverride({
        id: "override-skip",
        scheduleItemId: "item-2",
        overrideType: "skip",
        occurrenceDate: "2026-08-24",
      }),
    ];

    const occurrences = resolveScheduleOccurrences({
      schedule: BASE_SCHEDULE,
      items,
      overrides,
      startDate: "2026-08-24",
      endDate: "2026-08-24",
    });

    expect(occurrences.map((occurrence) => occurrence.title)).toEqual([
      "Deep Work",
    ]);
    expect(
      summarizeScheduleBlock(occurrences[0]!).isOverridden,
    ).toBe(true);
  });

  it("includes one-off ADD blocks and open-ended Lights Out", async () => {
    const items = [
      makeItem({
        id: "item-1",
        dayOfWeek: 0,
        title: "Lights Out",
        startTime: "22:30:00",
        endTime: null,
        category: "sleep",
      }),
    ];
    const overrides = [
      makeOverride({
        id: "override-add",
        overrideType: "add",
        occurrenceDate: "2026-08-24",
        title: "Melusi Work",
        category: "work",
        startTime: "13:00:00",
        endTime: "14:30:00",
      }),
    ];

    const occurrences = resolveScheduleOccurrences({
      schedule: BASE_SCHEDULE,
      items,
      overrides,
      startDate: "2026-08-24",
      endDate: "2026-08-24",
    });

    expect(occurrences.map((occurrence) => occurrence.title)).toEqual([
      "Melusi Work",
      "Lights Out",
    ]);
    expect(
      summarizeScheduleBlock(
        occurrences.find((occurrence) => occurrence.title === "Lights Out")!,
      ).end,
    ).toBe("onward");
  });

  it("returns no-schedule metadata before the period starts", async () => {
    const supabase = buildSupabaseMock({
      activeScheduleDate: null,
      schedules: [BASE_SCHEDULE],
    });

    const result = await getScheduleForDate(supabase as never, USER_A, {
      date: "2026-08-13",
    });

    expect(result.success).toBe(true);
    expect(result.scheduleApplies).toBe(false);
    expect(result.nearestUpcomingSchedule).toMatchObject({
      name: "Fall 2026 — Aug 24 to Oct 18",
      startDate: "2026-08-24",
    });
  });

  it("does not load another user's schedule", async () => {
    const supabase = buildSupabaseMock({
      activeScheduleDate: "2026-08-24",
      schedules: [{ ...BASE_SCHEDULE, userId: USER_A }],
    });

    const result = await getScheduleForDate(supabase as never, USER_B, {
      date: "2026-08-24",
    });

    expect(result.success).toBe(true);
    expect(result.scheduleApplies).toBe(false);
  });

  it("normalizes week queries to Monday and groups by date", async () => {
    const items = [
      makeItem({
        id: "item-mon",
        dayOfWeek: 0,
        title: "Monday Block",
        startTime: "08:00:00",
        endTime: "09:00:00",
      }),
      makeItem({
        id: "item-wed",
        dayOfWeek: 2,
        title: "Wednesday Block",
        startTime: "14:30:00",
        endTime: "15:20:00",
        category: "class",
      }),
    ];

    const supabase = buildSupabaseMock({
      activeScheduleDate: "2026-08-24",
      items,
    });

    const result = await getScheduleForWeek(supabase as never, USER_A, {
      date: "2026-08-26",
    });

    expect(result.success).toBe(true);
    expect(result.weekStart).toBe("2026-08-24");
    expect(result.weekEnd).toBe("2026-08-30");
    expect(result.days).toHaveLength(7);
    expect(result.days?.[0]).toMatchObject({
      date: "2026-08-24",
      weekday: "Monday",
      scheduleApplies: true,
    });
    expect(result.days?.[2]).toMatchObject({
      date: "2026-08-26",
      weekday: "Wednesday",
      scheduleApplies: true,
    });
  });

  it("returns partial-week truth before schedule start", async () => {
    const supabase = buildSupabaseMock({
      activeScheduleDate: null,
      schedules: [BASE_SCHEDULE],
    });

    const result = await getScheduleForWeek(supabase as never, USER_A, {
      weekStart: "2026-08-18",
    });

    expect(result.success).toBe(true);
    expect(
      result.days?.filter((day) => day.date < "2026-08-24").every(
        (day) => day.scheduleApplies === false,
      ),
    ).toBe(true);
  });

  it("returns actual schedule periods with temporal status", async () => {
    const supabase = buildSupabaseMock({
      schedules: [BASE_SCHEDULE],
    });

    const result = await getSchedulePeriods(supabase as never, USER_A, {
      referenceDate: "2026-08-13",
    });

    expect(result.success).toBe(true);
    expect(result.periods).toEqual([
      expect.objectContaining({
        name: "Fall 2026 — Aug 24 to Oct 18",
        appliesOnReferenceDate: false,
        temporalStatus: "upcoming",
      }),
    ]);
  });

  it("reports schedule conflicts without mutating data", async () => {
    const items = [
      makeItem({
        id: "item-1",
        dayOfWeek: 0,
        title: "Work Block",
        startTime: "08:00:00",
        endTime: "10:00:00",
      }),
      makeItem({
        id: "item-2",
        dayOfWeek: 0,
        title: "Class",
        startTime: "09:00:00",
        endTime: "10:30:00",
        category: "class",
      }),
    ];

    const occurrences = resolveScheduleOccurrences({
      schedule: BASE_SCHEDULE,
      items,
      overrides: [],
      startDate: "2026-08-24",
      endDate: "2026-08-24",
    });
    const conflicts = collectScheduleConflicts(occurrences);

    expect(conflicts.length).toBeGreaterThan(0);
    expect(
      occurrences.filter((occurrence) => occurrence.hasConflict).length,
    ).toBeGreaterThan(0);
  });

  it("returns safe errors for invalid input", async () => {
    const supabase = buildSupabaseMock({ schedules: [BASE_SCHEDULE] });

    await expect(
      getScheduleForDate(supabase as never, USER_A, { date: "not-a-date" }),
    ).resolves.toEqual({ success: false, error: "invalid_date" });

    await expect(
      findScheduleOpenWindowsTool(
        buildSupabaseMock({
          activeScheduleDate: "2026-08-24",
          items: [
            makeItem({
              id: "item-1",
              dayOfWeek: 0,
              title: "Work Block",
              startTime: "08:00:00",
              endTime: "09:00:00",
            }),
          ],
        }) as never,
        USER_A,
        {
          date: "2026-08-24",
          minimumDurationMinutes: "bad" as never,
        },
      ),
    ).resolves.toEqual({ success: false, error: "invalid_duration" });
  });
});

describe("schedule tool executor wiring", () => {
  it("executes get_schedule_for_date through the Main Jarvis executor", async () => {
    const supabase = buildSupabaseMock({
      activeScheduleDate: null,
      schedules: [BASE_SCHEDULE],
    });

    const result = JSON.parse(
      await executeJarvisTool(
        supabase as never,
        USER_A,
        {
          type: "function_call",
          name: "get_schedule_for_date",
          call_id: "call-1",
          arguments: JSON.stringify({ date: "2026-08-13" }),
        } as never,
        null,
        createInteractiveMainJarvisContext("call-1"),
      ),
    );

    expect(result.success).toBe(true);
    expect(result.scheduleApplies).toBe(false);
  });
});

describe("schedule read-only boundary", () => {
  it("does not import mutation RPCs or baseline template in schedule-tools", () => {
    const scheduleToolsSource = readFileSync(
      resolve(process.cwd(), "lib/jarvis/schedule/schedule-tools.ts"),
      "utf8",
    );

    expect(scheduleToolsSource).not.toContain("schedule-mutations");
    expect(scheduleToolsSource).not.toContain("fall-2026-baseline-template");
    expect(scheduleToolsSource).not.toContain(".rpc(");
    expect(scheduleToolsSource).not.toContain("jarvis_pending_schedule_actions");
    expect(scheduleToolsSource).not.toContain("action_requests");
  });

  it("formats weekday labels without UTC drift", () => {
    expect(formatWeekdayName("2026-08-24")).toBe("Monday");
    expect(formatWeekdayName("2026-08-26")).toBe("Wednesday");
  });
});
