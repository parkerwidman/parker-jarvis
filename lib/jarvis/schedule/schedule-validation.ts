import { SCHEDULE_CATEGORIES } from "@/lib/jarvis/schedule/schedule-types";
import type { ScheduleCategory } from "@/lib/jarvis/schedule/schedule-types";
import { normalizeTimeForStorage } from "@/lib/jarvis/schedule/schedule-datetime";
import type {
  ScheduleBlockFormValues,
  ScheduleRecurringCreateInput,
} from "@/lib/jarvis/schedule/schedule-mutation-types";

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidLocalDate(value: string): boolean {
  return LOCAL_DATE_PATTERN.test(value);
}

export function isValidScheduleCategory(
  value: string,
): value is ScheduleCategory {
  return (SCHEDULE_CATEGORIES as readonly string[]).includes(value);
}

export function isValidDayOfWeek(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

export function timeToMinutes(localTime: string): number {
  const normalized = normalizeTimeForStorage(localTime);
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

export function validateScheduleBlockForm(
  input: ScheduleBlockFormValues,
  scheduleBounds: { startDate: string; endDate: string },
): string | null {
  const title = input.title.trim();

  if (title.length < 1) {
    return "Title is required.";
  }

  if (!isValidScheduleCategory(input.category)) {
    return "Choose a supported category.";
  }

  if (!isValidLocalDate(input.occurrenceDate)) {
    return "Choose a valid date.";
  }

  if (
    input.occurrenceDate < scheduleBounds.startDate ||
    input.occurrenceDate > scheduleBounds.endDate
  ) {
    return "Date must fall within the selected schedule period.";
  }

  if (!isValidDayOfWeek(input.dayOfWeek)) {
    return "Choose a valid weekday.";
  }

  let startMinutes: number;
  let endMinutes: number | null = null;

  try {
    startMinutes = timeToMinutes(input.startTime);
    if (!input.isOpenEnded && input.endTime) {
      endMinutes = timeToMinutes(input.endTime);
    }
  } catch {
    return "Enter valid start and end times.";
  }

  if (!input.isOpenEnded) {
    if (!input.endTime) {
      return "End time is required unless the block is open-ended.";
    }

    if (endMinutes !== null && endMinutes <= startMinutes) {
      return "End time must be after start time.";
    }
  }

  return null;
}

export function validateRecurringCreateInput(
  input: ScheduleRecurringCreateInput,
  scheduleBounds: { startDate: string; endDate: string },
): string | null {
  const formError = validateScheduleBlockForm(input, scheduleBounds);

  if (formError) {
    return formError;
  }

  if (!isValidLocalDate(input.effectiveStartDate)) {
    return "Choose a valid start date for this recurrence.";
  }

  if (
    input.effectiveStartDate < scheduleBounds.startDate ||
    input.effectiveStartDate > scheduleBounds.endDate
  ) {
    return "Recurrence start must fall within the schedule period.";
  }

  return null;
}

export function hasOccurrenceDateChanged(
  originalDate: string,
  nextDate: string,
): boolean {
  return originalDate !== nextDate;
}
