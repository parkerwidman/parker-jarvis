import type {
  JarvisSchedule,
  ScheduleConflict,
  ScheduleOccurrence,
} from "@/lib/jarvis/schedule/schedule-types";
import { formatScheduleTime } from "@/lib/jarvis/schedule/schedule-week-view";

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export function isValidLocalDate(value: string): boolean {
  return LOCAL_DATE_PATTERN.test(value);
}

export function formatWeekdayName(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const jsDay = date.getUTCDay();
  const mondayZeroIndex = jsDay === 0 ? 6 : jsDay - 1;
  return WEEKDAY_NAMES[mondayZeroIndex];
}

export function summarizeSchedulePeriod(
  schedule: JarvisSchedule,
): Record<string, unknown> {
  return {
    id: schedule.id,
    name: schedule.name,
    startDate: schedule.startDate,
    endDate: schedule.endDate,
    timezone: schedule.timezone,
    status: schedule.status,
  };
}

export function summarizeScheduleBlock(
  occurrence: ScheduleOccurrence,
): Record<string, unknown> {
  return {
    title: occurrence.title,
    category: occurrence.category,
    start: formatScheduleTime(occurrence.localStartTime),
    end:
      occurrence.isOpenEnded || occurrence.localEndTime === null
        ? "onward"
        : formatScheduleTime(occurrence.localEndTime),
    source: occurrence.source,
    isOverridden: occurrence.isOverridden,
    isOpenEnded: occurrence.isOpenEnded,
    hasConflict: occurrence.hasConflict,
    notes: occurrence.notes,
  };
}

export function summarizeScheduleConflicts(
  occurrences: ScheduleOccurrence[],
  conflicts: ScheduleConflict[],
): Record<string, unknown>[] {
  const byKey = new Map(
    occurrences.map((occurrence) => [occurrence.occurrenceKey, occurrence]),
  );

  return conflicts.map((conflict) => {
    const left = byKey.get(conflict.occurrenceKey);
    const right = byKey.get(conflict.conflictingOccurrenceKey);

    return {
      first: left ? summarizeScheduleBlock(left) : null,
      second: right ? summarizeScheduleBlock(right) : null,
    };
  });
}
