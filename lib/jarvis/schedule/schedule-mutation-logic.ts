import { addDaysToLocalDate } from "@/lib/jarvis/schedule/schedule-datetime";
import type { ScheduleOccurrenceSource } from "@/lib/jarvis/schedule/schedule-types";

export function computeThisAndFutureEndDate(splitDate: string): string {
  return addDaysToLocalDate(splitDate, -1);
}

export function shouldMoveOccurrenceToDate(
  originalDate: string,
  nextDate: string,
): boolean {
  return originalDate !== nextDate;
}

export function resolveDeleteScopeDefault(): "this_date_only" {
  return "this_date_only";
}

export function resolveSaveScopeDefault(): "this_date_only" {
  return "this_date_only";
}

export function requiresRecurringSaveScope(
  source: ScheduleOccurrenceSource,
  scheduleItemId: string | null,
): boolean {
  return scheduleItemId !== null && source !== "added";
}

export function requiresRecurringDeleteScope(
  source: ScheduleOccurrenceSource,
  scheduleItemId: string | null,
): boolean {
  return scheduleItemId !== null && source !== "added";
}

export function overrideEligibleForNewRecurrence(
  occurrenceDate: string,
  splitDate: string,
  newDayOfWeek: number,
): boolean {
  if (occurrenceDate < splitDate) {
    return false;
  }

  const [year, month, day] = occurrenceDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const jsDay = date.getUTCDay();
  const mondayZero = jsDay === 0 ? 6 : jsDay - 1;

  return mondayZero === newDayOfWeek;
}
