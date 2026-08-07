import "server-only";

const ISO8601_OFFSET_PATTERN = /[Zz]|[+-]\d{2}:\d{2}$|[+-]\d{4}$/;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(profileTimezone: string | null | undefined): string {
  const candidate = profileTimezone?.trim();

  if (candidate && isValidTimeZone(candidate)) {
    return candidate;
  }

  return "America/Chicago";
}

export function getLocalDateString(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function getLocalDateFromIso(isoString: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoString));
}

export function formatLocalDateLabel(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
}

function getLocalHour(timeZone: string, date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hour12: false,
    }).format(date),
  );
}

export function addDaysToLocalDate(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

function localMidnightUtcMs(localDate: string, timeZone: string): number {
  const [year, month, day] = localDate.split("-").map(Number);
  const candidate = Date.UTC(year, month - 1, day, 12, 0, 0);

  for (let offsetHours = -14; offsetHours <= 14; offsetHours += 1) {
    const test = candidate + offsetHours * 60 * 60 * 1000;
    const testLocalDate = getLocalDateString(timeZone, new Date(test));

    if (testLocalDate === localDate && getLocalHour(timeZone, new Date(test)) === 0) {
      return test;
    }
  }

  return Date.UTC(year, month - 1, day, 0, 0, 0);
}

export function getLocalDayBounds(
  localDate: string,
  timeZone: string,
): { startDateTime: string; endDateTime: string } {
  const startMs = localMidnightUtcMs(localDate, timeZone);
  const nextDay = addDaysToLocalDate(localDate, 1);
  const endMs = localMidnightUtcMs(nextDay, timeZone) - 1;

  return {
    startDateTime: new Date(startMs).toISOString(),
    endDateTime: new Date(endMs).toISOString(),
  };
}

export function getCalendarFetchBounds(
  todayDate: string,
  timeZone: string,
): { startDateTime: string; endDateTime: string } {
  const todayBounds = getLocalDayBounds(todayDate, timeZone);
  const tomorrowDate = addDaysToLocalDate(todayDate, 1);
  const tomorrowEnd = getLocalDayBounds(tomorrowDate, timeZone).endDateTime;

  return {
    startDateTime: todayBounds.startDateTime,
    endDateTime: tomorrowEnd,
  };
}

export function formatTime(isoString: string, timeZone: string, isAllDay = false): string {
  if (isAllDay) {
    return "All day";
  }

  return new Date(isoString).toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function formatDueDate(isoString: string, timeZone: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  });
}

export function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}-minute opening`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (remainder === 0) {
    return `${hours}-hour opening`;
  }

  return `${hours}h ${remainder}m opening`;
}

export function minutesUntil(isoString: string, now = new Date()): number {
  return Math.max(0, Math.round((new Date(isoString).getTime() - now.getTime()) / 60000));
}

export function getGreeting(timeZone: string, now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hour12: false,
    }).format(now),
  );

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 17) {
    return "Good afternoon";
  }

  return "Good evening";
}

export function isValidIso8601WithOffset(value: string): boolean {
  if (!ISO8601_OFFSET_PATTERN.test(value)) {
    return false;
  }

  return !Number.isNaN(new Date(value).getTime());
}
