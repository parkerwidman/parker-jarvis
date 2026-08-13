import { compareTimeStrings, normalizeTimeForStorage } from "@/lib/jarvis/schedule/schedule-datetime";
import type { ScheduleOccurrence } from "@/lib/jarvis/schedule/schedule-types";
import { formatScheduleTime } from "@/lib/jarvis/schedule/schedule-week-view";

export const DEFAULT_OPEN_WINDOW_SEARCH_START = "06:00:00";
export const DEFAULT_OPEN_WINDOW_SEARCH_END = "22:30:00";

export type ScheduleOpenWindow = {
  startTime: string;
  endTime: string;
  startLabel: string;
  endLabel: string;
  durationMinutes: number;
};

export type FindScheduleOpenWindowsInput = {
  occurrences: ScheduleOccurrence[];
  date: string;
  searchStartTime?: string;
  searchEndTime?: string;
  minimumDurationMinutes?: number;
};

type OccupiedInterval = {
  startMinutes: number;
  endMinutes: number;
};

function timeStringToMinutes(localTime: string): number {
  const normalized = normalizeTimeForStorage(localTime);
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToTimeString(totalMinutes: number): string {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function normalizeSearchTime(
  value: string | undefined,
  fallback: string,
): string | "invalid" {
  if (value === undefined) {
    return fallback;
  }

  try {
    return normalizeTimeForStorage(value);
  } catch {
    return "invalid";
  }
}

function resolveMinimumDuration(value: number | undefined): number | "invalid" {
  if (value === undefined) {
    return 0;
  }

  if (!Number.isInteger(value) || value < 0 || value > 24 * 60) {
    return "invalid";
  }

  return value;
}

function buildOccupiedIntervals(
  occurrences: ScheduleOccurrence[],
  date: string,
  searchStartMinutes: number,
  searchEndMinutes: number,
): OccupiedInterval[] {
  const intervals: OccupiedInterval[] = [];

  for (const occurrence of occurrences) {
    if (occurrence.occurrenceDate !== date) {
      continue;
    }

    const startMinutes = timeStringToMinutes(occurrence.localStartTime);
    const endMinutes =
      occurrence.isOpenEnded || occurrence.localEndTime === null
        ? searchEndMinutes
        : timeStringToMinutes(occurrence.localEndTime);

    const clampedStart = Math.max(startMinutes, searchStartMinutes);
    const clampedEnd = Math.min(endMinutes, searchEndMinutes);

    if (clampedEnd <= clampedStart) {
      continue;
    }

    intervals.push({
      startMinutes: clampedStart,
      endMinutes: clampedEnd,
    });
  }

  intervals.sort((left, right) => left.startMinutes - right.startMinutes);

  const merged: OccupiedInterval[] = [];

  for (const interval of intervals) {
    const previous = merged.at(-1);

    if (!previous || interval.startMinutes > previous.endMinutes) {
      merged.push({ ...interval });
      continue;
    }

    previous.endMinutes = Math.max(previous.endMinutes, interval.endMinutes);
  }

  return merged;
}

export function findScheduleOpenWindows(
  input: FindScheduleOpenWindowsInput,
): { success: true; windows: ScheduleOpenWindow[] } | { success: false; error: string } {
  const searchStartTime = normalizeSearchTime(
    input.searchStartTime,
    DEFAULT_OPEN_WINDOW_SEARCH_START,
  );
  if (searchStartTime === "invalid") {
    return { success: false, error: "invalid_search_bounds" };
  }

  const searchEndTime = normalizeSearchTime(
    input.searchEndTime,
    DEFAULT_OPEN_WINDOW_SEARCH_END,
  );
  if (searchEndTime === "invalid") {
    return { success: false, error: "invalid_search_bounds" };
  }

  if (compareTimeStrings(searchEndTime, searchStartTime) <= 0) {
    return { success: false, error: "invalid_search_bounds" };
  }

  const minimumDurationMinutes = resolveMinimumDuration(input.minimumDurationMinutes);
  if (minimumDurationMinutes === "invalid") {
    return { success: false, error: "invalid_duration" };
  }

  const searchStartMinutes = timeStringToMinutes(searchStartTime);
  const searchEndMinutes = timeStringToMinutes(searchEndTime);
  const occupied = buildOccupiedIntervals(
    input.occurrences,
    input.date,
    searchStartMinutes,
    searchEndMinutes,
  );

  const windows: ScheduleOpenWindow[] = [];
  let cursor = searchStartMinutes;

  for (const interval of occupied) {
    if (interval.startMinutes > cursor) {
      const durationMinutes = interval.startMinutes - cursor;

      if (durationMinutes >= minimumDurationMinutes) {
        const startTime = minutesToTimeString(cursor);
        const endTime = minutesToTimeString(interval.startMinutes);
        windows.push({
          startTime,
          endTime,
          startLabel: formatScheduleTime(startTime),
          endLabel: formatScheduleTime(endTime),
          durationMinutes,
        });
      }
    }

    cursor = Math.max(cursor, interval.endMinutes);
  }

  if (cursor < searchEndMinutes) {
    const durationMinutes = searchEndMinutes - cursor;

    if (durationMinutes >= minimumDurationMinutes) {
      const startTime = minutesToTimeString(cursor);
      const endTime = minutesToTimeString(searchEndMinutes);
      windows.push({
        startTime,
        endTime,
        startLabel: formatScheduleTime(startTime),
        endLabel: formatScheduleTime(endTime),
        durationMinutes,
      });
    }
  }

  return { success: true, windows };
}
