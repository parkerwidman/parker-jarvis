import {
  compareTimeStrings,
  getMondayZeroDayOfWeek,
  isDateInInclusiveRange,
  iterateLocalDatesInclusive,
  localDateTimeToIso,
  normalizeTimeForStorage,
} from "@/lib/jarvis/schedule/schedule-datetime";
import type {
  JarvisSchedule,
  JarvisScheduleItem,
  JarvisScheduleOverride,
  ScheduleCategory,
  ScheduleConflict,
  ScheduleOccurrence,
  ScheduleOccurrenceSource,
} from "@/lib/jarvis/schedule/schedule-types";

export type ResolveScheduleOccurrencesInput = {
  schedule: JarvisSchedule;
  items: JarvisScheduleItem[];
  overrides: JarvisScheduleOverride[];
  startDate: string;
  endDate: string;
};

export function isScheduleItemEffectiveOnDate(
  item: JarvisScheduleItem,
  date: string,
): boolean {
  if (getMondayZeroDayOfWeek(date) !== item.dayOfWeek) {
    return false;
  }

  if (date < item.effectiveStartDate) {
    return false;
  }

  if (item.effectiveEndDate !== null && date > item.effectiveEndDate) {
    return false;
  }

  return true;
}

function buildOccurrenceKey(parts: {
  scheduleId: string;
  occurrenceDate: string;
  scheduleItemId: string | null;
  overrideId: string | null;
  startTime: string;
  source: ScheduleOccurrenceSource;
}): string {
  return [
    parts.scheduleId,
    parts.occurrenceDate,
    parts.source,
    parts.scheduleItemId ?? "none",
    parts.overrideId ?? "none",
    normalizeTimeForStorage(parts.startTime),
  ].join(":");
}

function createOccurrence(input: {
  schedule: JarvisSchedule;
  occurrenceDate: string;
  scheduleItemId: string | null;
  overrideId: string | null;
  title: string;
  category: ScheduleCategory;
  notes: string | null;
  startTime: string;
  endTime: string | null;
  source: ScheduleOccurrenceSource;
  isOverridden: boolean;
  sortOrder: number;
}): ScheduleOccurrence {
  const isOpenEnded = input.endTime === null;
  const localStart = localDateTimeToIso(
    input.occurrenceDate,
    input.startTime,
    input.schedule.timezone,
  );
  const localEnd =
    input.endTime === null
      ? null
      : localDateTimeToIso(
          input.occurrenceDate,
          input.endTime,
          input.schedule.timezone,
        );

  return {
    occurrenceKey: buildOccurrenceKey({
      scheduleId: input.schedule.id,
      occurrenceDate: input.occurrenceDate,
      scheduleItemId: input.scheduleItemId,
      overrideId: input.overrideId,
      startTime: input.startTime,
      source: input.source,
    }),
    scheduleId: input.schedule.id,
    scheduleItemId: input.scheduleItemId,
    overrideId: input.overrideId,
    occurrenceDate: input.occurrenceDate,
    dayOfWeek: getMondayZeroDayOfWeek(input.occurrenceDate),
    title: input.title,
    category: input.category,
    notes: input.notes,
    localStart,
    localEnd,
    localStartTime: normalizeTimeForStorage(input.startTime),
    localEndTime: input.endTime === null ? null : normalizeTimeForStorage(input.endTime),
    timezone: input.schedule.timezone,
    source: input.source,
    isOverridden: input.isOverridden,
    isOpenEnded,
    hasConflict: false,
    sortOrder: input.sortOrder,
  };
}

function getOverridesForDate(
  overrides: JarvisScheduleOverride[],
  date: string,
): JarvisScheduleOverride[] {
  return overrides.filter((override) => override.occurrenceDate === date);
}

export function resolveScheduleOccurrencesForDate(input: {
  schedule: JarvisSchedule;
  items: JarvisScheduleItem[];
  overrides: JarvisScheduleOverride[];
  date: string;
}): ScheduleOccurrence[] {
  const { schedule, items, overrides, date } = input;

  if (
    !isDateInInclusiveRange(date, schedule.startDate, schedule.endDate)
  ) {
    return [];
  }

  const dateOverrides = getOverridesForDate(overrides, date);
  const occurrences: ScheduleOccurrence[] = [];

  for (const item of items) {
    if (!isScheduleItemEffectiveOnDate(item, date)) {
      continue;
    }

    const itemOverrides = dateOverrides.filter(
      (override) => override.scheduleItemId === item.id,
    );
    const skipOverride = itemOverrides.find(
      (override) => override.overrideType === "skip",
    );

    if (skipOverride) {
      continue;
    }

    const replaceOverride = itemOverrides.find(
      (override) => override.overrideType === "replace",
    );

    if (replaceOverride) {
      occurrences.push(
        createOccurrence({
          schedule,
          occurrenceDate: date,
          scheduleItemId: item.id,
          overrideId: replaceOverride.id,
          title: replaceOverride.title ?? item.title,
          category: replaceOverride.category ?? item.category,
          notes: replaceOverride.notes ?? item.notes,
          startTime: replaceOverride.startTime ?? item.startTime,
          endTime: replaceOverride.endTime ?? item.endTime,
          source: "replaced",
          isOverridden: true,
          sortOrder: item.sortOrder,
        }),
      );
      continue;
    }

    occurrences.push(
      createOccurrence({
        schedule,
        occurrenceDate: date,
        scheduleItemId: item.id,
        overrideId: null,
        title: item.title,
        category: item.category,
        notes: item.notes,
        startTime: item.startTime,
        endTime: item.endTime,
        source: "recurring",
        isOverridden: false,
        sortOrder: item.sortOrder,
      }),
    );
  }

  for (const addOverride of dateOverrides.filter(
    (override) => override.overrideType === "add",
  )) {
    occurrences.push(
      createOccurrence({
        schedule,
        occurrenceDate: date,
        scheduleItemId: null,
        overrideId: addOverride.id,
        title: addOverride.title ?? "Untitled",
        category: addOverride.category ?? "other",
        notes: addOverride.notes,
        startTime: addOverride.startTime ?? "00:00",
        endTime: addOverride.endTime,
        source: "added",
        isOverridden: true,
        sortOrder: 1000,
      }),
    );
  }

  occurrences.sort((left, right) => {
    const timeComparison = compareTimeStrings(
      left.localStartTime,
      right.localStartTime,
    );

    if (timeComparison !== 0) {
      return timeComparison;
    }

    return left.sortOrder - right.sortOrder;
  });

  return markScheduleConflicts(occurrences).occurrences;
}

export function resolveScheduleOccurrences(
  input: ResolveScheduleOccurrencesInput,
): ScheduleOccurrence[] {
  const boundedStart =
    input.startDate < input.schedule.startDate
      ? input.schedule.startDate
      : input.startDate;
  const boundedEnd =
    input.endDate > input.schedule.endDate
      ? input.schedule.endDate
      : input.endDate;

  if (boundedStart > boundedEnd) {
    return [];
  }

  const dates = iterateLocalDatesInclusive(boundedStart, boundedEnd);
  const occurrences: ScheduleOccurrence[] = [];

  for (const date of dates) {
    occurrences.push(
      ...resolveScheduleOccurrencesForDate({
        schedule: input.schedule,
        items: input.items,
        overrides: input.overrides,
        date,
      }),
    );
  }

  return occurrences;
}

function getOccurrenceEndMs(occurrence: ScheduleOccurrence): number {
  if (occurrence.isOpenEnded || occurrence.localEnd === null) {
    return Number.POSITIVE_INFINITY;
  }

  return new Date(occurrence.localEnd).getTime();
}

export function scheduleOccurrencesOverlap(
  left: ScheduleOccurrence,
  right: ScheduleOccurrence,
): boolean {
  if (left.occurrenceDate !== right.occurrenceDate) {
    return false;
  }

  const leftStart = new Date(left.localStart).getTime();
  const rightStart = new Date(right.localStart).getTime();
  const leftEnd = getOccurrenceEndMs(left);
  const rightEnd = getOccurrenceEndMs(right);

  if (!left.isOpenEnded && !right.isOpenEnded) {
    if (leftEnd <= rightStart || rightEnd <= leftStart) {
      return false;
    }

    return leftStart < rightEnd && rightStart < leftEnd;
  }

  if (left.isOpenEnded && !right.isOpenEnded) {
    return rightEnd > leftStart;
  }

  if (!left.isOpenEnded && right.isOpenEnded) {
    return leftEnd > rightStart;
  }

  return leftStart === rightStart;
}

export function markScheduleConflicts(occurrences: ScheduleOccurrence[]): {
  occurrences: ScheduleOccurrence[];
  conflicts: ScheduleConflict[];
} {
  const conflicts: ScheduleConflict[] = [];
  const marked = occurrences.map((occurrence) => ({ ...occurrence }));

  for (let index = 0; index < marked.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < marked.length; otherIndex += 1) {
      const current = marked[index];
      const other = marked[otherIndex];

      if (!scheduleOccurrencesOverlap(current, other)) {
        continue;
      }

      current.hasConflict = true;
      other.hasConflict = true;

      conflicts.push({
        occurrenceKey: current.occurrenceKey,
        conflictingOccurrenceKey: other.occurrenceKey,
      });
    }
  }

  return { occurrences: marked, conflicts };
}

export function collectScheduleConflicts(
  occurrences: ScheduleOccurrence[],
): ScheduleConflict[] {
  return markScheduleConflicts(occurrences).conflicts;
}
