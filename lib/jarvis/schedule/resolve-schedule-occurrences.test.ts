import { describe, expect, it } from "vitest";

import {
  isScheduleItemEffectiveOnDate,
  markScheduleConflicts,
  resolveScheduleOccurrences,
  resolveScheduleOccurrencesForDate,
  scheduleOccurrencesOverlap,
} from "@/lib/jarvis/schedule/resolve-schedule-occurrences";
import type {
  JarvisSchedule,
  JarvisScheduleItem,
  JarvisScheduleOverride,
} from "@/lib/jarvis/schedule/schedule-types";

const BASE_SCHEDULE: JarvisSchedule = {
  id: "schedule-1",
  userId: "user-1",
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
    id: overrides.id,
    userId: "user-1",
    scheduleId: BASE_SCHEDULE.id,
    dayOfWeek: overrides.dayOfWeek,
    effectiveStartDate: overrides.effectiveStartDate ?? "2026-08-24",
    effectiveEndDate: overrides.effectiveEndDate ?? null,
    startTime: overrides.startTime ?? "09:00",
    endTime: overrides.endTime !== undefined ? overrides.endTime : "10:00",
    title: overrides.title,
    category: overrides.category ?? "work",
    notes: overrides.notes ?? null,
    metadata: overrides.metadata ?? {},
    sortOrder: overrides.sortOrder ?? 0,
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
  };
}

function makeOverride(
  overrides: Partial<JarvisScheduleOverride> &
    Pick<
      JarvisScheduleOverride,
      "id" | "overrideType" | "occurrenceDate"
    >,
): JarvisScheduleOverride {
  return {
    id: overrides.id,
    userId: "user-1",
    scheduleId: BASE_SCHEDULE.id,
    scheduleItemId: overrides.scheduleItemId ?? null,
    occurrenceDate: overrides.occurrenceDate,
    overrideType: overrides.overrideType,
    startTime: overrides.startTime ?? null,
    endTime: overrides.endTime ?? null,
    title: overrides.title ?? null,
    category: overrides.category ?? null,
    notes: overrides.notes ?? null,
    metadata: overrides.metadata ?? {},
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
  };
}

describe("resolveScheduleOccurrences", () => {
  const mondayWorkout = makeItem({
    id: "item-workout",
    dayOfWeek: 0,
    title: "Chest/Back",
    startTime: "09:30",
    endTime: "12:00",
    category: "gym",
  });

  const mondayLightsOut = makeItem({
    id: "item-sleep",
    dayOfWeek: 0,
    title: "Lights Out",
    startTime: "22:30",
    endTime: null,
    category: "sleep",
    sortOrder: 9,
  });

  it("materializes normal recurring items for a weekday", () => {
    const occurrences = resolveScheduleOccurrencesForDate({
      schedule: BASE_SCHEDULE,
      items: [mondayWorkout],
      overrides: [],
      date: "2026-08-24",
    });

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      title: "Chest/Back",
      source: "recurring",
      occurrenceDate: "2026-08-24",
      dayOfWeek: 0,
      category: "gym",
    });
  });

  it("selects items only on matching weekdays", () => {
    const occurrences = resolveScheduleOccurrencesForDate({
      schedule: BASE_SCHEDULE,
      items: [mondayWorkout],
      overrides: [],
      date: "2026-08-25",
    });

    expect(occurrences).toHaveLength(0);
  });

  it("respects schedule start boundaries", () => {
    const occurrences = resolveScheduleOccurrencesForDate({
      schedule: BASE_SCHEDULE,
      items: [mondayWorkout],
      overrides: [],
      date: "2026-08-23",
    });

    expect(occurrences).toHaveLength(0);
  });

  it("respects schedule end boundaries", () => {
    const occurrences = resolveScheduleOccurrencesForDate({
      schedule: BASE_SCHEDULE,
      items: [mondayWorkout],
      overrides: [],
      date: "2026-10-19",
    });

    expect(occurrences).toHaveLength(0);
  });

  it("respects item effective_start_date", () => {
    const futureItem = makeItem({
      id: "item-future",
      dayOfWeek: 0,
      title: "Future Block",
      effectiveStartDate: "2026-09-01",
      startTime: "08:00",
      endTime: "09:00",
    });

    expect(
      isScheduleItemEffectiveOnDate(futureItem, "2026-08-31"),
    ).toBe(false);

    const occurrences = resolveScheduleOccurrencesForDate({
      schedule: BASE_SCHEDULE,
      items: [futureItem],
      overrides: [],
      date: "2026-09-07",
    });

    expect(occurrences).toHaveLength(1);
  });

  it("respects item effective_end_date", () => {
    const limitedItem = makeItem({
      id: "item-limited",
      dayOfWeek: 0,
      title: "Limited Block",
      effectiveEndDate: "2026-09-07",
      startTime: "08:00",
      endTime: "09:00",
    });

    expect(
      isScheduleItemEffectiveOnDate(limitedItem, "2026-09-14"),
    ).toBe(false);

    const occurrences = resolveScheduleOccurrencesForDate({
      schedule: BASE_SCHEDULE,
      items: [limitedItem],
      overrides: [],
      date: "2026-09-07",
    });

    expect(occurrences).toHaveLength(1);
  });

  it("omits skipped occurrences", () => {
    const occurrences = resolveScheduleOccurrencesForDate({
      schedule: BASE_SCHEDULE,
      items: [mondayWorkout],
      overrides: [
        makeOverride({
          id: "override-skip",
          overrideType: "skip",
          occurrenceDate: "2026-08-24",
          scheduleItemId: mondayWorkout.id,
        }),
      ],
      date: "2026-08-24",
    });

    expect(occurrences).toHaveLength(0);
  });

  it("emits replaced occurrences with override timing", () => {
    const wednesdayWorkout = makeItem({
      id: "item-workout-wed",
      dayOfWeek: 2,
      title: "Legs",
      startTime: "09:30",
      endTime: "12:00",
      category: "gym",
    });

    const occurrences = resolveScheduleOccurrencesForDate({
      schedule: BASE_SCHEDULE,
      items: [wednesdayWorkout],
      overrides: [
        makeOverride({
          id: "override-replace",
          overrideType: "replace",
          occurrenceDate: "2026-09-09",
          scheduleItemId: wednesdayWorkout.id,
          startTime: "15:30",
          endTime: "18:00",
          title: "Moved Legs",
        }),
      ],
      date: "2026-09-09",
    });

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      title: "Moved Legs",
      source: "replaced",
      isOverridden: true,
      localStartTime: "15:30:00",
      localEndTime: "18:00:00",
    });
  });

  it("appends added one-off occurrences", () => {
    const occurrences = resolveScheduleOccurrencesForDate({
      schedule: BASE_SCHEDULE,
      items: [mondayWorkout],
      overrides: [
        makeOverride({
          id: "override-add",
          overrideType: "add",
          occurrenceDate: "2026-08-24",
          startTime: "13:00",
          endTime: "14:00",
          title: "Advising Meeting",
          category: "class",
        }),
      ],
      date: "2026-08-24",
    });

    expect(occurrences).toHaveLength(2);
    expect(occurrences[0]?.title).toBe("Chest/Back");
    expect(occurrences[1]).toMatchObject({
      title: "Advising Meeting",
      source: "added",
      category: "class",
    });
  });

  it("sorts occurrences chronologically", () => {
    const morning = makeItem({
      id: "item-morning",
      dayOfWeek: 0,
      title: "Morning Routine",
      startTime: "06:30",
      endTime: "08:00",
      category: "morning_routine",
      sortOrder: 0,
    });
    const evening = makeItem({
      id: "item-evening",
      dayOfWeek: 0,
      title: "Work Block",
      startTime: "19:30",
      endTime: "21:30",
      category: "work",
      sortOrder: 1,
    });

    const occurrences = resolveScheduleOccurrencesForDate({
      schedule: BASE_SCHEDULE,
      items: [evening, morning],
      overrides: [],
      date: "2026-08-24",
    });

    expect(occurrences.map((occurrence) => occurrence.title)).toEqual([
      "Morning Routine",
      "Work Block",
    ]);
  });

  it("does not mark adjacent blocks as conflicts", () => {
    const first = makeItem({
      id: "item-first",
      dayOfWeek: 0,
      title: "Night Routine",
      startTime: "22:00",
      endTime: "22:30",
      category: "night_routine",
    });
    const second = makeItem({
      id: "item-second",
      dayOfWeek: 0,
      title: "Lights Out",
      startTime: "22:30",
      endTime: null,
      category: "sleep",
    });

    const occurrences = resolveScheduleOccurrencesForDate({
      schedule: BASE_SCHEDULE,
      items: [first, second],
      overrides: [],
      date: "2026-08-24",
    });

    expect(occurrences.every((occurrence) => !occurrence.hasConflict)).toBe(true);
    expect(
      scheduleOccurrencesOverlap(occurrences[0]!, occurrences[1]!),
    ).toBe(false);
  });

  it("marks actual overlaps as conflicts", () => {
    const overlapA = makeItem({
      id: "item-a",
      dayOfWeek: 0,
      title: "Block A",
      startTime: "09:00",
      endTime: "10:30",
    });
    const overlapB = makeItem({
      id: "item-b",
      dayOfWeek: 0,
      title: "Block B",
      startTime: "10:00",
      endTime: "11:00",
    });

    const { occurrences, conflicts } = markScheduleConflicts(
      resolveScheduleOccurrencesForDate({
        schedule: BASE_SCHEDULE,
        items: [overlapA, overlapB],
        overrides: [],
        date: "2026-08-24",
      }),
    );

    expect(occurrences.every((occurrence) => occurrence.hasConflict)).toBe(true);
    expect(conflicts).toHaveLength(1);
  });

  it("preserves open-ended Lights Out occurrences", () => {
    const occurrences = resolveScheduleOccurrencesForDate({
      schedule: BASE_SCHEDULE,
      items: [mondayLightsOut],
      overrides: [],
      date: "2026-08-24",
    });

    expect(occurrences[0]).toMatchObject({
      title: "Lights Out",
      isOpenEnded: true,
      localEnd: null,
      localEndTime: null,
      localStartTime: "22:30:00",
    });
  });

  it("does not create false conflicts between morning blocks and open-ended sleep", () => {
    const morning = makeItem({
      id: "item-morning",
      dayOfWeek: 0,
      title: "Morning Routine",
      startTime: "06:30",
      endTime: "08:00",
      category: "morning_routine",
    });

    const occurrences = resolveScheduleOccurrencesForDate({
      schedule: BASE_SCHEDULE,
      items: [morning, mondayLightsOut],
      overrides: [],
      date: "2026-08-24",
    });

    expect(occurrences.every((occurrence) => !occurrence.hasConflict)).toBe(true);
  });

  it("keeps history unchanged before a future series split", () => {
    const original = makeItem({
      id: "item-original",
      dayOfWeek: 2,
      title: "Legs",
      effectiveEndDate: "2026-09-15",
      startTime: "09:30",
      endTime: "12:00",
      category: "gym",
    });
    const revised = makeItem({
      id: "item-revised",
      dayOfWeek: 2,
      title: "Legs",
      effectiveStartDate: "2026-09-16",
      startTime: "15:30",
      endTime: "18:00",
      category: "gym",
    });

    const beforeSplit = resolveScheduleOccurrencesForDate({
      schedule: BASE_SCHEDULE,
      items: [original, revised],
      overrides: [],
      date: "2026-09-09",
    });

    expect(beforeSplit).toHaveLength(1);
    expect(beforeSplit[0]).toMatchObject({
      scheduleItemId: "item-original",
      localStartTime: "09:30:00",
      localEndTime: "12:00:00",
    });

    const afterSplit = resolveScheduleOccurrencesForDate({
      schedule: BASE_SCHEDULE,
      items: [original, revised],
      overrides: [],
      date: "2026-09-16",
    });

    expect(afterSplit).toHaveLength(1);
    expect(afterSplit[0]).toMatchObject({
      scheduleItemId: "item-revised",
      localStartTime: "15:30:00",
      localEndTime: "18:00:00",
    });
  });

  it("resolves multi-day ranges within schedule bounds", () => {
    const monday = makeItem({
      id: "item-monday",
      dayOfWeek: 0,
      title: "Monday Block",
      startTime: "08:00",
      endTime: "09:00",
    });
    const tuesday = makeItem({
      id: "item-tuesday",
      dayOfWeek: 1,
      title: "Tuesday Block",
      startTime: "08:00",
      endTime: "09:00",
    });

    const occurrences = resolveScheduleOccurrences({
      schedule: BASE_SCHEDULE,
      items: [monday, tuesday],
      overrides: [],
      startDate: "2026-08-24",
      endDate: "2026-08-25",
    });

    expect(occurrences).toHaveLength(2);
    expect(occurrences.map((occurrence) => occurrence.occurrenceDate)).toEqual([
      "2026-08-24",
      "2026-08-25",
    ]);
  });
});
