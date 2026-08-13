import { describe, expect, it } from "vitest";

import { findScheduleOpenWindows } from "@/lib/jarvis/schedule/find-schedule-open-windows";
import type { ScheduleOccurrence } from "@/lib/jarvis/schedule/schedule-types";

function makeOccurrence(
  overrides: Partial<ScheduleOccurrence> &
    Pick<ScheduleOccurrence, "localStartTime" | "title">,
): ScheduleOccurrence {
  return {
    occurrenceKey: overrides.occurrenceKey ?? `${overrides.title}-${overrides.localStartTime}`,
    scheduleId: "schedule-1",
    scheduleItemId: overrides.scheduleItemId ?? "item-1",
    overrideId: overrides.overrideId ?? null,
    occurrenceDate: overrides.occurrenceDate ?? "2026-08-24",
    dayOfWeek: 0,
    title: overrides.title,
    category: overrides.category ?? "work",
    notes: overrides.notes ?? null,
    localStart: "2026-08-24T11:30:00.000Z",
    localEnd: overrides.localEnd ?? "2026-08-24T14:30:00.000Z",
    localStartTime: overrides.localStartTime,
    localEndTime:
      overrides.localEndTime !== undefined ? overrides.localEndTime : "09:30:00",
    timezone: "America/Chicago",
    source: overrides.source ?? "recurring",
    isOverridden: overrides.isOverridden ?? false,
    isOpenEnded: overrides.isOpenEnded ?? false,
    hasConflict: overrides.hasConflict ?? false,
    sortOrder: overrides.sortOrder ?? 0,
  };
}

describe("findScheduleOpenWindows", () => {
  it("finds normal gaps between blocks", () => {
    const result = findScheduleOpenWindows({
      occurrences: [
        makeOccurrence({
          title: "Morning Routine",
          localStartTime: "06:30:00",
          localEndTime: "08:00:00",
        }),
        makeOccurrence({
          title: "Work Block",
          localStartTime: "08:00:00",
          localEndTime: "09:30:00",
        }),
        makeOccurrence({
          title: "Chest/Back",
          localStartTime: "09:30:00",
          localEndTime: "12:00:00",
        }),
      ],
      date: "2026-08-24",
      minimumDurationMinutes: 30,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.windows).toEqual([
      expect.objectContaining({
        startLabel: "6:00 AM",
        endLabel: "6:30 AM",
        durationMinutes: 30,
      }),
      expect.objectContaining({
        startLabel: "12:00 PM",
        endLabel: "10:30 PM",
      }),
    ]);
  });

  it("filters by minimum duration", () => {
    const result = findScheduleOpenWindows({
      occurrences: [
        makeOccurrence({
          title: "Work Block",
          localStartTime: "08:00:00",
          localEndTime: "08:20:00",
        }),
        makeOccurrence({
          title: "Chest/Back",
          localStartTime: "08:30:00",
          localEndTime: "09:30:00",
        }),
      ],
      date: "2026-08-24",
      minimumDurationMinutes: 15,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.windows.some((window) => window.durationMinutes === 10)).toBe(
      false,
    );
    expect(result.windows.some((window) => window.durationMinutes >= 15)).toBe(
      true,
    );
  });

  it("creates no gap between adjacent blocks", () => {
    const result = findScheduleOpenWindows({
      occurrences: [
        makeOccurrence({
          title: "Work Block",
          localStartTime: "08:00:00",
          localEndTime: "09:30:00",
        }),
        makeOccurrence({
          title: "Chest/Back",
          localStartTime: "09:30:00",
          localEndTime: "12:00:00",
        }),
      ],
      date: "2026-08-24",
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(
      result.windows.some(
        (window) =>
          window.startLabel === "9:30 AM" && window.endLabel === "9:30 AM",
      ),
    ).toBe(false);
  });

  it("merges overlapping blocks before computing gaps", () => {
    const result = findScheduleOpenWindows({
      occurrences: [
        makeOccurrence({
          title: "Work Block",
          localStartTime: "08:00:00",
          localEndTime: "10:00:00",
        }),
        makeOccurrence({
          title: "Class",
          localStartTime: "09:00:00",
          localEndTime: "10:30:00",
        }),
      ],
      date: "2026-08-24",
      minimumDurationMinutes: 30,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(
      result.windows.some(
        (window) =>
          window.startLabel === "6:00 AM" && window.endLabel === "8:00 AM",
      ),
    ).toBe(true);
    expect(
      result.windows.some(
        (window) =>
          window.startLabel === "8:00 AM" && window.endLabel === "9:00 AM",
      ),
    ).toBe(false);
  });

  it("uses replacement times when provided", () => {
    const result = findScheduleOpenWindows({
      occurrences: [
        makeOccurrence({
          title: "Work Block",
          localStartTime: "08:00:00",
          localEndTime: "09:30:00",
          source: "replaced",
          isOverridden: true,
        }),
      ],
      date: "2026-08-24",
      minimumDurationMinutes: 60,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(
      result.windows.some(
        (window) =>
          window.startLabel === "6:00 AM" && window.endLabel === "8:00 AM",
      ),
    ).toBe(true);
  });

  it("treats skipped recurring blocks as free time", () => {
    const result = findScheduleOpenWindows({
      occurrences: [],
      date: "2026-08-24",
      minimumDurationMinutes: 60,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]?.durationMinutes).toBe(16 * 60 + 30);
  });

  it("consumes open time for one-off ADD blocks", () => {
    const result = findScheduleOpenWindows({
      occurrences: [
        makeOccurrence({
          title: "Melusi Work",
          localStartTime: "13:00:00",
          localEndTime: "14:30:00",
          source: "added",
          scheduleItemId: null,
        }),
      ],
      date: "2026-08-24",
      minimumDurationMinutes: 60,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(
      result.windows.some(
        (window) =>
          window.startLabel === "6:00 AM" && window.endLabel === "1:00 PM",
      ),
    ).toBe(true);
    expect(
      result.windows.some(
        (window) =>
          window.startLabel === "1:00 PM" && window.endLabel === "2:30 PM",
      ),
    ).toBe(false);
  });

  it("blocks the remainder of the search window for Lights Out", () => {
    const result = findScheduleOpenWindows({
      occurrences: [
        makeOccurrence({
          title: "Lights Out",
          localStartTime: "22:30:00",
          localEndTime: null,
          isOpenEnded: true,
          localEnd: null,
        }),
      ],
      date: "2026-08-24",
      minimumDurationMinutes: 15,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(
      result.windows.some((window) => window.startLabel === "10:30 PM"),
    ).toBe(false);
    expect(
      result.windows.some(
        (window) =>
          window.startLabel === "6:00 AM" && window.endLabel === "10:30 PM",
      ),
    ).toBe(true);
  });

  it("honors custom search bounds", () => {
    const result = findScheduleOpenWindows({
      occurrences: [
        makeOccurrence({
          title: "Work Block",
          localStartTime: "08:00:00",
          localEndTime: "09:00:00",
        }),
      ],
      date: "2026-08-24",
      searchStartTime: "07:00:00",
      searchEndTime: "12:00:00",
      minimumDurationMinutes: 30,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.windows[0]).toMatchObject({
      startLabel: "7:00 AM",
      endLabel: "8:00 AM",
    });
    expect(
      result.windows.some((window) => window.endLabel === "10:30 PM"),
    ).toBe(false);
  });

  it("rejects invalid duration and search bounds", () => {
    expect(
      findScheduleOpenWindows({
        occurrences: [],
        date: "2026-08-24",
        minimumDurationMinutes: -1,
      }),
    ).toEqual({ success: false, error: "invalid_duration" });

    expect(
      findScheduleOpenWindows({
        occurrences: [],
        date: "2026-08-24",
        searchStartTime: "22:00:00",
        searchEndTime: "06:00:00",
      }),
    ).toEqual({ success: false, error: "invalid_search_bounds" });
  });
});
