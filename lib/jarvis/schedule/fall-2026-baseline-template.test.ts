import { describe, expect, it } from "vitest";

import {
  FALL_2026_BASELINE_EFFECTIVE_START_DATE,
  FALL_2026_BASELINE_END_DATE,
  FALL_2026_BASELINE_ITEMS,
  FALL_2026_BASELINE_SCHEDULE_NAME,
  FALL_2026_BASELINE_START_DATE,
} from "@/lib/jarvis/schedule/fall-2026-baseline-template";
import type {
  JarvisSchedule,
  JarvisScheduleItem,
} from "@/lib/jarvis/schedule/schedule-types";

function countByDay(items: JarvisScheduleItem[] | typeof FALL_2026_BASELINE_ITEMS) {
  const counts = new Map<number, number>();

  for (const item of items) {
    counts.set(item.dayOfWeek, (counts.get(item.dayOfWeek) ?? 0) + 1);
  }

  return counts;
}

function findItem(
  dayOfWeek: number,
  title: string,
  startTime: string,
) {
  return FALL_2026_BASELINE_ITEMS.find(
    (item) =>
      item.dayOfWeek === dayOfWeek &&
      item.title === title &&
      item.startTime === startTime,
  );
}

describe("fall 2026 baseline template", () => {
  it("contains exactly 54 recurring schedule items", () => {
    expect(FALL_2026_BASELINE_ITEMS).toHaveLength(54);
  });

  it("represents all seven weekdays", () => {
    const counts = countByDay(FALL_2026_BASELINE_ITEMS);
    expect(counts.size).toBe(7);
  });

  it("matches the exact per-day item counts", () => {
    const counts = countByDay(FALL_2026_BASELINE_ITEMS);
    expect(counts.get(0)).toBe(9);
    expect(counts.get(1)).toBe(7);
    expect(counts.get(2)).toBe(9);
    expect(counts.get(3)).toBe(7);
    expect(counts.get(4)).toBe(7);
    expect(counts.get(5)).toBe(7);
    expect(counts.get(6)).toBe(8);
  });

  it("uses the expected schedule identity and date range", () => {
    expect(FALL_2026_BASELINE_SCHEDULE_NAME).toBe("Fall 2026 — Aug 24 to Oct 18");
    expect(FALL_2026_BASELINE_START_DATE).toBe("2026-08-24");
    expect(FALL_2026_BASELINE_END_DATE).toBe("2026-10-18");
  });

  it("does not include a Sunday Reading block", () => {
    const sundayReading = FALL_2026_BASELINE_ITEMS.find(
      (item) => item.dayOfWeek === 6 && item.category === "reading",
    );
    expect(sundayReading).toBeUndefined();
  });

  it("includes Monday class blocks at the exact baseline times", () => {
    expect(findItem(0, "BAIS:2800", "14:30")).toMatchObject({
      endTime: "15:20",
      category: "class",
    });
    expect(findItem(0, "SEES:1400", "16:30")).toMatchObject({
      endTime: "17:20",
      category: "class",
    });
  });

  it("includes Wednesday BAIS and both SEES blocks at exact times", () => {
    expect(findItem(2, "BAIS:2800", "08:30")).toMatchObject({
      endTime: "09:20",
      category: "class",
    });

    const wednesdaySees = FALL_2026_BASELINE_ITEMS.filter(
      (item) => item.dayOfWeek === 2 && item.title === "SEES:1400",
    );

    expect(wednesdaySees).toHaveLength(2);
    expect(wednesdaySees.map((item) => item.startTime).sort()).toEqual([
      "13:00",
      "16:30",
    ]);
  });

  it("includes Friday BAIS at 08:30–09:20", () => {
    expect(findItem(4, "BAIS:2800", "08:30")).toMatchObject({
      endTime: "09:20",
      category: "class",
    });
  });

  it("matches the exact gym split by weekday", () => {
    expect(findItem(0, "Chest/Back", "09:30")?.category).toBe("gym");
    expect(findItem(1, "Shoulders/Arms", "09:30")?.category).toBe("gym");
    expect(findItem(2, "Legs", "09:30")?.category).toBe("gym");
    expect(findItem(3, "Chest/Back", "09:30")?.category).toBe("gym");
    expect(findItem(4, "Shoulders/Arms", "09:30")?.category).toBe("gym");
    expect(findItem(5, "Legs", "09:30")?.category).toBe("gym");
    expect(findItem(6, "Active Recovery", "13:00")?.category).toBe("recovery");
  });

  it("preserves open-ended Lights Out blocks at 22:30 on every day", () => {
    const lightsOutItems = FALL_2026_BASELINE_ITEMS.filter(
      (item) => item.title === "Lights Out",
    );

    expect(lightsOutItems).toHaveLength(7);
    expect(lightsOutItems.every((item) => item.startTime === "22:30")).toBe(true);
    expect(lightsOutItems.every((item) => item.endTime === null)).toBe(true);
    expect(lightsOutItems.every((item) => item.category === "sleep")).toBe(true);
  });

  it("sets effective_start_date to 2026-08-24 for every baseline item", () => {
    expect(
      FALL_2026_BASELINE_ITEMS.every(
        (item) => item.effectiveStartDate === FALL_2026_BASELINE_EFFECTIVE_START_DATE,
      ),
    ).toBe(true);
  });
});

describe("fall 2026 baseline template type sanity", () => {
  it("types baseline items as schedule domain data", () => {
    const schedule: JarvisSchedule = {
      id: "schedule-1",
      userId: "user-1",
      name: FALL_2026_BASELINE_SCHEDULE_NAME,
      description: null,
      startDate: FALL_2026_BASELINE_START_DATE,
      endDate: FALL_2026_BASELINE_END_DATE,
      timezone: "America/Chicago",
      status: "active",
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
    };

    expect(schedule.name).toBe(FALL_2026_BASELINE_SCHEDULE_NAME);
    expect(FALL_2026_BASELINE_ITEMS[0]?.category).toBe("morning_routine");
  });
});
