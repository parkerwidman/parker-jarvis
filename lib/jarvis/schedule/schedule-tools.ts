import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getLocalDateString,
  resolveTimeZone,
} from "@/lib/jarvis/dashboard/command-center-utils";
import {
  addDaysToLocalDate,
  isDateInInclusiveRange,
  iterateLocalDatesInclusive,
} from "@/lib/jarvis/schedule/schedule-datetime";
import {
  DEFAULT_OPEN_WINDOW_SEARCH_END,
  DEFAULT_OPEN_WINDOW_SEARCH_START,
  findScheduleOpenWindows,
} from "@/lib/jarvis/schedule/find-schedule-open-windows";
import { getActiveJarvisScheduleForDate } from "@/lib/jarvis/schedule/get-active-schedule-for-date";
import { loadScheduleRange } from "@/lib/jarvis/schedule/load-schedule-range";
import { loadUserSchedules } from "@/lib/jarvis/schedule/load-user-schedules";
import {
  formatWeekdayName,
  isValidLocalDate,
  summarizeScheduleBlock,
  summarizeScheduleConflicts,
  summarizeSchedulePeriod,
} from "@/lib/jarvis/schedule/schedule-tool-formatters";
import type { JarvisSchedule } from "@/lib/jarvis/schedule/schedule-types";
import {
  getMondayWeekStart,
  getWeekEnd,
} from "@/lib/jarvis/schedule/schedule-week-view";

function failure(error: string): Record<string, unknown> {
  return { success: false, error };
}

async function resolveUserTimezone(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("jarvis_profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();

  return resolveTimeZone(
    typeof data?.timezone === "string" ? data.timezone : null,
  );
}

function parseOptionalLocalDate(value: unknown): string | null | "invalid" {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string" || !isValidLocalDate(value)) {
    return "invalid";
  }

  return value;
}

function findNearestUpcomingSchedule(
  schedules: JarvisSchedule[],
  localDate: string,
): JarvisSchedule | null {
  const upcoming = schedules
    .filter((schedule) => schedule.startDate > localDate)
    .sort((left, right) => left.startDate.localeCompare(right.startDate));

  return upcoming[0] ?? null;
}

function findNearestHistoricalSchedule(
  schedules: JarvisSchedule[],
  localDate: string,
): JarvisSchedule | null {
  const historical = schedules
    .filter((schedule) => schedule.endDate < localDate)
    .sort((left, right) => right.endDate.localeCompare(left.endDate));

  return historical[0] ?? null;
}

function deriveTemporalStatus(
  schedule: JarvisSchedule,
  referenceDate: string,
): "current" | "upcoming" | "historical" {
  if (referenceDate < schedule.startDate) {
    return "upcoming";
  }

  if (referenceDate > schedule.endDate) {
    return "historical";
  }

  return "current";
}

async function loadResolvedScheduleForDate(
  supabase: SupabaseClient,
  userId: string,
  localDate: string,
): Promise<
  | {
      success: true;
      scheduleApplies: true;
      schedule: JarvisSchedule;
      blocks: Record<string, unknown>[];
      conflicts: Record<string, unknown>[];
    }
  | {
      success: true;
      scheduleApplies: false;
      nearestUpcoming: JarvisSchedule | null;
      nearestHistorical: JarvisSchedule | null;
    }
  | { success: false; error: string }
> {
  const activeSchedule = await getActiveJarvisScheduleForDate(
    supabase,
    userId,
    localDate,
  );

  if (!activeSchedule) {
    const schedules = await loadUserSchedules(supabase, userId);

    return {
      success: true,
      scheduleApplies: false,
      nearestUpcoming: findNearestUpcomingSchedule(schedules, localDate),
      nearestHistorical: findNearestHistoricalSchedule(schedules, localDate),
    };
  }

  const loaded = await loadScheduleRange(supabase, {
    userId,
    startDate: localDate,
    endDate: localDate,
    scheduleId: activeSchedule.id,
  });

  if (!loaded.success) {
    return { success: false, error: "load_failed" };
  }

  const dayOccurrences = loaded.data.occurrences.filter(
    (occurrence) => occurrence.occurrenceDate === localDate,
  );

  return {
    success: true,
    scheduleApplies: true,
    schedule: loaded.data.schedule,
    blocks: dayOccurrences.map(summarizeScheduleBlock),
    conflicts: summarizeScheduleConflicts(
      dayOccurrences,
      loaded.data.conflicts.filter((conflict) =>
        dayOccurrences.some(
          (occurrence) =>
            occurrence.occurrenceKey === conflict.occurrenceKey ||
            occurrence.occurrenceKey === conflict.conflictingOccurrenceKey,
        ),
      ),
    ),
  };
}

export async function getScheduleForDate(
  supabase: SupabaseClient,
  userId: string,
  args: { date?: unknown },
): Promise<Record<string, unknown>> {
  const timezone = await resolveUserTimezone(supabase, userId);
  const parsedDate = parseOptionalLocalDate(args.date);

  if (parsedDate === "invalid") {
    return failure("invalid_date");
  }

  const localDate = parsedDate ?? getLocalDateString(timezone);
  const resolved = await loadResolvedScheduleForDate(supabase, userId, localDate);

  if (!resolved.success) {
    return failure(resolved.error);
  }

  const base = {
    success: true,
    date: localDate,
    weekday: formatWeekdayName(localDate),
    timezone,
  };

  if (!resolved.scheduleApplies) {
    return {
      ...base,
      scheduleApplies: false,
      message: `No Jarvis Schedule applies on ${localDate}.`,
      nearestUpcomingSchedule: resolved.nearestUpcoming
        ? summarizeSchedulePeriod(resolved.nearestUpcoming)
        : null,
      nearestHistoricalSchedule: resolved.nearestHistorical
        ? summarizeSchedulePeriod(resolved.nearestHistorical)
        : null,
    };
  }

  return {
    ...base,
    scheduleApplies: true,
    schedule: summarizeSchedulePeriod(resolved.schedule),
    blockCount: resolved.blocks.length,
    blocks: resolved.blocks,
    conflicts: resolved.conflicts,
  };
}

export async function getScheduleForWeek(
  supabase: SupabaseClient,
  userId: string,
  args: { date?: unknown; weekStart?: unknown },
): Promise<Record<string, unknown>> {
  const timezone = await resolveUserTimezone(supabase, userId);
  const parsedDate = parseOptionalLocalDate(args.date);
  const parsedWeekStart = parseOptionalLocalDate(args.weekStart);

  if (parsedDate === "invalid" || parsedWeekStart === "invalid") {
    return failure("invalid_date");
  }

  const anchorDate =
    parsedWeekStart ??
    parsedDate ??
    getLocalDateString(timezone);
  const weekStart = getMondayWeekStart(anchorDate);
  const weekEnd = getWeekEnd(weekStart);
  const dates = iterateLocalDatesInclusive(weekStart, weekEnd);
  const days: Record<string, unknown>[] = [];
  const schedulePeriods = new Map<string, JarvisSchedule>();
  let totalBlocks = 0;

  for (const date of dates) {
    const resolved = await loadResolvedScheduleForDate(supabase, userId, date);

    if (!resolved.success) {
      return failure(resolved.error);
    }

    if (!resolved.scheduleApplies) {
      days.push({
        date,
        weekday: formatWeekdayName(date),
        scheduleApplies: false,
        blocks: [],
        conflicts: [],
      });
      continue;
    }

    schedulePeriods.set(resolved.schedule.id, resolved.schedule);
    totalBlocks += resolved.blocks.length;

    days.push({
      date,
      weekday: formatWeekdayName(date),
      scheduleApplies: true,
      schedule: summarizeSchedulePeriod(resolved.schedule),
      blockCount: resolved.blocks.length,
      blocks: resolved.blocks,
      conflicts: resolved.conflicts,
    });
  }

  return {
    success: true,
    weekStart,
    weekEnd,
    timezone,
    schedulePeriodCount: schedulePeriods.size,
    schedules: [...schedulePeriods.values()].map(summarizeSchedulePeriod),
    totalBlocks,
    days,
  };
}

export async function getSchedulePeriods(
  supabase: SupabaseClient,
  userId: string,
  args: { referenceDate?: unknown } = {},
): Promise<Record<string, unknown>> {
  const timezone = await resolveUserTimezone(supabase, userId);
  const parsedReferenceDate = parseOptionalLocalDate(args.referenceDate);

  if (parsedReferenceDate === "invalid") {
    return failure("invalid_date");
  }

  const referenceDate = parsedReferenceDate ?? getLocalDateString(timezone);
  const schedules = await loadUserSchedules(supabase, userId);

  return {
    success: true,
    referenceDate,
    timezone,
    periodCount: schedules.length,
    periods: schedules.map((schedule) => ({
      ...summarizeSchedulePeriod(schedule),
      appliesOnReferenceDate: isDateInInclusiveRange(
        referenceDate,
        schedule.startDate,
        schedule.endDate,
      ),
      temporalStatus: deriveTemporalStatus(schedule, referenceDate),
    })),
  };
}

export async function findScheduleOpenWindowsTool(
  supabase: SupabaseClient,
  userId: string,
  args: {
    date?: unknown;
    earliestTime?: unknown;
    latestTime?: unknown;
    minimumDurationMinutes?: unknown;
  },
): Promise<Record<string, unknown>> {
  const timezone = await resolveUserTimezone(supabase, userId);
  const parsedDate = parseOptionalLocalDate(args.date);

  if (parsedDate === "invalid") {
    return failure("invalid_date");
  }

  const localDate = parsedDate ?? getLocalDateString(timezone);
  const resolved = await loadResolvedScheduleForDate(supabase, userId, localDate);

  if (!resolved.success) {
    return failure(resolved.error);
  }

  if (!resolved.scheduleApplies) {
    return {
      success: true,
      date: localDate,
      timezone,
      scheduleApplies: false,
      message: `No Jarvis Schedule applies on ${localDate}, so no structural open windows exist.`,
      nearestUpcomingSchedule: resolved.nearestUpcoming
        ? summarizeSchedulePeriod(resolved.nearestUpcoming)
        : null,
      windows: [],
    };
  }

  const loaded = await loadScheduleRange(supabase, {
    userId,
    startDate: localDate,
    endDate: localDate,
    scheduleId: resolved.schedule.id,
  });

  if (!loaded.success) {
    return failure("load_failed");
  }

  const minimumDurationMinutes =
    args.minimumDurationMinutes === null ||
    args.minimumDurationMinutes === undefined
      ? undefined
      : typeof args.minimumDurationMinutes === "number"
        ? args.minimumDurationMinutes
        : "invalid";

  if (minimumDurationMinutes === "invalid") {
    return failure("invalid_duration");
  }

  const windowsResult = findScheduleOpenWindows({
    occurrences: loaded.data.occurrences,
    date: localDate,
    searchStartTime:
      typeof args.earliestTime === "string" ? args.earliestTime : undefined,
    searchEndTime:
      typeof args.latestTime === "string" ? args.latestTime : undefined,
    minimumDurationMinutes,
  });

  if (!windowsResult.success) {
    return failure(windowsResult.error);
  }

  return {
    success: true,
    date: localDate,
    weekday: formatWeekdayName(localDate),
    timezone,
    scheduleApplies: true,
    schedule: summarizeSchedulePeriod(resolved.schedule),
    searchStart:
      typeof args.earliestTime === "string"
        ? args.earliestTime
        : DEFAULT_OPEN_WINDOW_SEARCH_START,
    searchEnd:
      typeof args.latestTime === "string"
        ? args.latestTime
        : DEFAULT_OPEN_WINDOW_SEARCH_END,
    minimumDurationMinutes: minimumDurationMinutes ?? 0,
    windowCount: windowsResult.windows.length,
    windows: windowsResult.windows,
    note:
      "These windows are open relative to Jarvis Schedule only. Actual availability may also depend on Outlook calendar events.",
  };
}

export async function loadScheduleRangeForUser(
  supabase: SupabaseClient,
  userId: string,
  params: {
    startDate: string;
    endDate: string;
    scheduleId?: string;
  },
): Promise<ReturnType<typeof loadScheduleRange>> {
  return loadScheduleRange(supabase, {
    userId,
    startDate: params.startDate,
    endDate: params.endDate,
    scheduleId: params.scheduleId,
  });
}

export {
  DEFAULT_OPEN_WINDOW_SEARCH_END,
  DEFAULT_OPEN_WINDOW_SEARCH_START,
  addDaysToLocalDate,
};
