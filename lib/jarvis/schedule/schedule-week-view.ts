import {
  addDaysToLocalDate,
  getMondayZeroDayOfWeek,
  isDateInInclusiveRange,
  iterateLocalDatesInclusive,
  normalizeTimeForStorage,
} from "@/lib/jarvis/schedule/schedule-datetime";
import type { ScheduleBlockEditContext } from "@/lib/jarvis/schedule/schedule-mutation-types";
import type {
  JarvisSchedule,
  ScheduleCategory,
  ScheduleOccurrence,
  ScheduleOccurrenceSource,
} from "@/lib/jarvis/schedule/schedule-types";

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const SCHEDULE_GRID_START_HOUR = 6;
export const SCHEDULE_GRID_END_HOUR = 23;
export const SCHEDULE_HOUR_HEIGHT_PX = 52;

export const SCHEDULE_GRID_HEIGHT_PX =
  (SCHEDULE_GRID_END_HOUR - SCHEDULE_GRID_START_HOUR) * SCHEDULE_HOUR_HEIGHT_PX;

export const SCHEDULE_GRID_START_MINUTES = SCHEDULE_GRID_START_HOUR * 60;
export const SCHEDULE_GRID_END_MINUTES = SCHEDULE_GRID_END_HOUR * 60;

export type ScheduleWeekDay = {
  date: string;
  dayOfWeek: number;
  weekdayLabel: string;
  dayNumber: string;
  isToday: boolean;
};

export type ScheduleBlockViewModel = {
  occurrenceKey: string;
  scheduleId: string;
  scheduleItemId: string | null;
  overrideId: string | null;
  source: ScheduleOccurrenceSource;
  date: string;
  dayOfWeek: number;
  weekdayLabel: string;
  title: string;
  category: ScheduleCategory;
  notes: string | null;
  localStartTime: string;
  localEndTime: string | null;
  timeLabel: string;
  displayTimeLabel: string;
  ariaLabel: string;
  topPx: number;
  heightPx: number;
  isOpenEnded: boolean;
  hasConflict: boolean;
  compact: boolean;
  dense: boolean;
};

export type ScheduleWeekViewModel = {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  days: ScheduleWeekDay[];
  blocks: ScheduleBlockViewModel[];
  hourLabels: string[];
  intersectsSchedule: boolean;
  usedCategories: ScheduleCategory[];
};

export function getMondayWeekStart(localDate: string): string {
  const dayIndex = getMondayZeroDayOfWeek(localDate);
  return addDaysToLocalDate(localDate, -dayIndex);
}

export function getWeekEnd(weekStart: string): string {
  return addDaysToLocalDate(weekStart, 6);
}

export function resolveDefaultWeekStart(
  todayLocal: string,
  schedule: Pick<JarvisSchedule, "startDate" | "endDate">,
): string {
  if (todayLocal < schedule.startDate) {
    return getMondayWeekStart(schedule.startDate);
  }

  if (todayLocal > schedule.endDate) {
    return getMondayWeekStart(schedule.endDate);
  }

  return getMondayWeekStart(todayLocal);
}

export function parseWeekQueryParam(
  weekParam: string | undefined,
  fallbackWeekStart: string,
): string {
  if (!weekParam || !LOCAL_DATE_PATTERN.test(weekParam)) {
    return fallbackWeekStart;
  }

  return getMondayWeekStart(weekParam);
}

export function weekIntersectsSchedule(
  weekStart: string,
  weekEnd: string,
  schedule: Pick<JarvisSchedule, "startDate" | "endDate">,
): boolean {
  return !(
    weekEnd < schedule.startDate || weekStart > schedule.endDate
  );
}

export function buildScheduleHref(
  weekStart: string,
  scheduleId: string,
): string {
  const params = new URLSearchParams({
    week: weekStart,
    schedule: scheduleId,
  });

  return `/schedule?${params.toString()}`;
}

export function timeStringToMinutes(localTime: string): number {
  const normalized = normalizeTimeForStorage(localTime);
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

export function formatScheduleTime(localTime: string): string {
  const normalized = normalizeTimeForStorage(localTime);
  const [hour, minute] = normalized.split(":").map(Number);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;

  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

export function formatWeekLabel(weekStart: string, weekEnd: string): string {
  const start = formatShortMonthDay(weekStart);
  const end = formatShortMonthDay(weekEnd);

  if (weekStart.slice(0, 4) === weekEnd.slice(0, 4)) {
    return `${start} – ${end}`;
  }

  return `${start}, ${weekStart.slice(0, 4)} – ${end}, ${weekEnd.slice(0, 4)}`;
}

export function formatSchedulePeriodRange(
  schedule: Pick<JarvisSchedule, "startDate" | "endDate">,
): string {
  return `${formatShortMonthDay(schedule.startDate)} – ${formatShortMonthDay(schedule.endDate)}`;
}

function formatShortMonthDay(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatWeekdayLabel(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  return date
    .toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })
    .toUpperCase();
}

export function buildScheduleHourLabels(): string[] {
  const labels: string[] = [];

  for (let hour = SCHEDULE_GRID_START_HOUR; hour <= SCHEDULE_GRID_END_HOUR; hour += 1) {
    const period = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    labels.push(`${hour12} ${period}`);
  }

  return labels;
}

export function buildScheduleBlockLayout(input: {
  startTime: string;
  endTime: string | null;
  isOpenEnded: boolean;
}): { topPx: number; heightPx: number } {
  const startMinutes = timeStringToMinutes(input.startTime);
  const topPx =
    ((startMinutes - SCHEDULE_GRID_START_MINUTES) / 60) * SCHEDULE_HOUR_HEIGHT_PX;

  if (input.isOpenEnded || input.endTime === null) {
    return {
      topPx,
      heightPx: Math.max(SCHEDULE_GRID_HEIGHT_PX - topPx, SCHEDULE_HOUR_HEIGHT_PX / 2),
    };
  }

  const endMinutes = timeStringToMinutes(input.endTime);
  const heightPx = Math.max(
    ((endMinutes - startMinutes) / 60) * SCHEDULE_HOUR_HEIGHT_PX,
    SCHEDULE_HOUR_HEIGHT_PX * 0.45,
  );

  return { topPx, heightPx };
}

function buildTimeLabel(
  startTime: string,
  endTime: string | null,
  isOpenEnded: boolean,
): string {
  const startLabel = formatScheduleTime(startTime);

  if (isOpenEnded || endTime === null) {
    return `${startLabel} →`;
  }

  return `${startLabel} – ${formatScheduleTime(endTime)}`;
}

export function buildCompactTimeLabel(
  startTime: string,
  endTime: string | null,
  isOpenEnded: boolean,
): string {
  const startLabel = formatScheduleTime(startTime);

  if (isOpenEnded || endTime === null) {
    return `${startLabel} →`;
  }

  const endLabel = formatScheduleTime(endTime);
  const startPeriod = startLabel.slice(-2);
  const endPeriod = endLabel.slice(-2);

  if (startPeriod === endPeriod) {
    const startShort = startLabel.replace(` ${startPeriod}`, "");
    const endShort = endLabel.replace(` ${endPeriod}`, "");
    return `${startShort}–${endShort} ${endPeriod}`;
  }

  return `${startLabel} – ${endLabel}`;
}

function resolveBlockDensity(heightPx: number): {
  compact: boolean;
  dense: boolean;
} {
  const compact = heightPx < SCHEDULE_HOUR_HEIGHT_PX * 0.85;
  const dense = heightPx < 34;

  return { compact, dense };
}

function buildBlockAriaLabel(
  occurrence: ScheduleOccurrence,
): string {
  const weekday = formatWeekdayLabel(occurrence.occurrenceDate);
  const timeLabel = buildTimeLabel(
    occurrence.localStartTime,
    occurrence.localEndTime,
    occurrence.isOpenEnded,
  );

  return `${occurrence.title}, ${weekday}, ${timeLabel}`;
}

export function buildScheduleWeekViewModel(input: {
  weekStart: string;
  todayLocal: string;
  schedule: JarvisSchedule;
  occurrences: ScheduleOccurrence[];
}): ScheduleWeekViewModel {
  const weekEnd = getWeekEnd(input.weekStart);
  const dates = iterateLocalDatesInclusive(input.weekStart, weekEnd);
  const intersectsSchedule = weekIntersectsSchedule(
    input.weekStart,
    weekEnd,
    input.schedule,
  );

  const days: ScheduleWeekDay[] = dates.map((date) => ({
    date,
    dayOfWeek: getMondayZeroDayOfWeek(date),
    weekdayLabel: formatWeekdayLabel(date),
    dayNumber: date.slice(8, 10).replace(/^0/, ""),
    isToday: date === input.todayLocal,
  }));

  const blocks: ScheduleBlockViewModel[] = input.occurrences.map((occurrence) => {
    const layout = buildScheduleBlockLayout({
      startTime: occurrence.localStartTime,
      endTime: occurrence.localEndTime,
      isOpenEnded: occurrence.isOpenEnded,
    });
    const timeLabel = buildTimeLabel(
      occurrence.localStartTime,
      occurrence.localEndTime,
      occurrence.isOpenEnded,
    );
    const { compact, dense } = resolveBlockDensity(layout.heightPx);

    return {
      occurrenceKey: occurrence.occurrenceKey,
      scheduleId: occurrence.scheduleId,
      scheduleItemId: occurrence.scheduleItemId,
      overrideId: occurrence.overrideId,
      source: occurrence.source,
      date: occurrence.occurrenceDate,
      dayOfWeek: occurrence.dayOfWeek,
      weekdayLabel: formatWeekdayLabel(occurrence.occurrenceDate),
      title: occurrence.title,
      category: occurrence.category,
      notes: occurrence.notes,
      localStartTime: occurrence.localStartTime,
      localEndTime: occurrence.localEndTime,
      timeLabel,
      displayTimeLabel:
        compact || dense
          ? buildCompactTimeLabel(
              occurrence.localStartTime,
              occurrence.localEndTime,
              occurrence.isOpenEnded,
            )
          : timeLabel,
      ariaLabel: buildBlockAriaLabel(occurrence),
      topPx: layout.topPx,
      heightPx: layout.heightPx,
      isOpenEnded: occurrence.isOpenEnded,
      hasConflict: occurrence.hasConflict,
      compact,
      dense,
    };
  });

  const usedCategories = [...new Set(blocks.map((block) => block.category))];

  return {
    weekStart: input.weekStart,
    weekEnd,
    weekLabel: formatWeekLabel(input.weekStart, weekEnd),
    days,
    blocks,
    hourLabels: buildScheduleHourLabels(),
    intersectsSchedule,
    usedCategories,
  };
}

export function isValidScheduleId(value: string | undefined): value is string {
  if (!value) {
    return false;
  }

  return /^[0-9a-f-]{36}$/i.test(value);
}

export function resolveSelectedScheduleId(
  scheduleParam: string | undefined,
  schedules: JarvisSchedule[],
  fallbackScheduleId: string,
): string {
  if (
    isValidScheduleId(scheduleParam) &&
    schedules.some((schedule) => schedule.id === scheduleParam)
  ) {
    return scheduleParam;
  }

  if (schedules.some((schedule) => schedule.id === fallbackScheduleId)) {
    return fallbackScheduleId;
  }

  return schedules[0]?.id ?? fallbackScheduleId;
}

function toTimeInputValue(localTime: string): string {
  const normalized = normalizeTimeForStorage(localTime);
  return normalized.slice(0, 5);
}

export function blockToEditContext(
  block: ScheduleBlockViewModel,
): ScheduleBlockEditContext {
  return {
    scheduleId: block.scheduleId,
    scheduleItemId: block.scheduleItemId,
    overrideId: block.overrideId,
    source: block.source,
    occurrenceKey: block.occurrenceKey,
    weekdayLabel: block.weekdayLabel,
    title: block.title,
    category: block.category,
    occurrenceDate: block.date,
    dayOfWeek: block.dayOfWeek,
    startTime: toTimeInputValue(block.localStartTime),
    endTime: block.localEndTime ? toTimeInputValue(block.localEndTime) : null,
    isOpenEnded: block.isOpenEnded,
    notes: block.notes,
  };
}

export { toTimeInputValue };

export function scheduleContainsDate(
  schedule: Pick<JarvisSchedule, "startDate" | "endDate">,
  localDate: string,
): boolean {
  return isDateInInclusiveRange(
    localDate,
    schedule.startDate,
    schedule.endDate,
  );
}
