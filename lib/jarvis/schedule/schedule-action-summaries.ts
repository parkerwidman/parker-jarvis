import { getMondayZeroDayOfWeek } from "@/lib/jarvis/schedule/schedule-datetime";
import type {
  ScheduleBlockEditContext,
  ScheduleBlockFormValues,
  ScheduleDeleteScope,
  ScheduleEditScope,
} from "@/lib/jarvis/schedule/schedule-mutation-types";
import {
  formatWeekdayName,
} from "@/lib/jarvis/schedule/schedule-tool-formatters";
import { formatScheduleTime } from "@/lib/jarvis/schedule/schedule-week-view";

function formatTimeRange(
  startTime: string,
  endTime: string | null,
  isOpenEnded: boolean,
): string {
  const startLabel = formatScheduleTime(startTime);

  if (isOpenEnded || !endTime) {
    return `${startLabel} onward`;
  }

  return `${startLabel}–${formatScheduleTime(endTime)}`;
}

function formatDateLabel(localDate: string): string {
  const weekday = formatWeekdayName(localDate);
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const monthDay = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  return `${weekday}, ${monthDay}`;
}

function scopeLabel(scope: ScheduleEditScope | ScheduleDeleteScope): string {
  switch (scope) {
    case "this_date_only":
      return "This changes that date only.";
    case "this_and_future":
      return "This changes the selected date and all future occurrences.";
    case "entire_series":
      return "This changes every occurrence in the series.";
  }
}

export function buildOneOffAddSummary(input: {
  title: string;
  occurrenceDate: string;
  startTime: string;
  endTime: string | null;
  isOpenEnded: boolean;
}): string {
  return `Add "${input.title}" on ${formatDateLabel(input.occurrenceDate)} from ${formatTimeRange(
    input.startTime,
    input.endTime,
    input.isOpenEnded,
  )}.`;
}

export function buildRecurringAddSummary(input: {
  title: string;
  dayOfWeek: number;
  effectiveStartDate: string;
  startTime: string;
  endTime: string | null;
  isOpenEnded: boolean;
}): string {
  const weekdayNames = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  return `Add recurring "${input.title}" every ${weekdayNames[input.dayOfWeek]} starting ${formatDateLabel(
    input.effectiveStartDate,
  )} from ${formatTimeRange(input.startTime, input.endTime, input.isOpenEnded)}.`;
}

export function buildUpdateSummary(input: {
  title: string;
  occurrenceDate: string;
  startTime: string;
  endTime: string | null;
  isOpenEnded: boolean;
  scope: ScheduleEditScope;
}): string {
  return `Change ${input.title} on ${formatDateLabel(input.occurrenceDate)} to ${formatTimeRange(
    input.startTime,
    input.endTime,
    input.isOpenEnded,
  )}. ${scopeLabel(input.scope)}`;
}

export function buildMoveSummary(input: {
  title: string;
  sourceDate: string;
  targetDate: string;
  startTime: string;
  endTime: string | null;
  isOpenEnded: boolean;
  originalStartTime?: string;
  originalEndTime?: string | null;
  originalIsOpenEnded?: boolean;
}): string {
  const fromRange = input.originalStartTime
    ? formatTimeRange(
        input.originalStartTime,
        input.originalEndTime ?? null,
        input.originalIsOpenEnded ?? false,
      )
    : "its current time";
  const toRange = formatTimeRange(input.startTime, input.endTime, input.isOpenEnded);

  return `Move ${input.title} on ${formatDateLabel(input.sourceDate)} from ${fromRange} to ${formatDateLabel(
    input.targetDate,
  )} at ${toRange}. This changes ${formatDateLabel(input.sourceDate)} only.`;
}

export function buildRemoveSummary(input: {
  title: string;
  occurrenceDate: string;
  scope: ScheduleDeleteScope;
}): string {
  if (input.scope === "entire_series") {
    return `Remove ${input.title} from every occurrence in this schedule.`;
  }

  if (input.scope === "this_and_future") {
    return `Remove ${input.title} from ${formatDateLabel(input.occurrenceDate)} and all future occurrences.`;
  }

  return `Remove ${input.title} on ${formatDateLabel(input.occurrenceDate)} only.`;
}

export function buildEditContextFromProposal(input: {
  scheduleId: string;
  scheduleItemId?: string | null;
  overrideId?: string | null;
  occurrenceKey?: string;
  source?: string;
  occurrenceDate: string;
  title: string;
  category: string;
  dayOfWeek?: number;
  startTime: string;
  endTime?: string | null;
  isOpenEnded?: boolean;
  notes?: string | null;
}): ScheduleBlockEditContext {
  return {
    scheduleId: input.scheduleId,
    scheduleItemId: input.scheduleItemId ?? null,
    overrideId: input.overrideId ?? null,
    source:
      input.source === "added" || input.source === "replaced"
        ? input.source
        : "recurring",
    occurrenceKey: input.occurrenceKey ?? `${input.scheduleId}:${input.occurrenceDate}`,
    weekdayLabel: formatWeekdayName(input.occurrenceDate),
    title: input.title,
    category: input.category as ScheduleBlockEditContext["category"],
    occurrenceDate: input.occurrenceDate,
    dayOfWeek: input.dayOfWeek ?? getMondayZeroDayOfWeek(input.occurrenceDate),
    startTime: input.startTime,
    endTime: input.endTime ?? null,
    isOpenEnded: input.isOpenEnded ?? false,
    notes: input.notes ?? null,
  };
}

export function buildFormValuesFromProposal(input: {
  title: string;
  category: string;
  occurrenceDate: string;
  dayOfWeek?: number;
  startTime: string;
  endTime?: string | null;
  isOpenEnded?: boolean;
  notes?: string | null;
}): ScheduleBlockFormValues {
  return {
    title: input.title,
    category: input.category as ScheduleBlockFormValues["category"],
    occurrenceDate: input.occurrenceDate,
    dayOfWeek: input.dayOfWeek ?? getMondayZeroDayOfWeek(input.occurrenceDate),
    startTime: input.startTime,
    endTime: input.endTime ?? null,
    isOpenEnded: input.isOpenEnded ?? false,
    notes: input.notes ?? null,
  };
}
