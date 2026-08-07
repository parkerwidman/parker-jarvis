function hasExplicitUtcOffset(dateTime: string): boolean {
  return /[Zz]|[+-]\d{2}:\d{2}$|[+-]\d{4}$/.test(dateTime.trim());
}

export function normalizeGraphDateTimeString(dateTime: string): string {
  return dateTime.trim().replace(/\.\d+$/, "");
}

function getTimeZoneOffsetMs(timeZone: string, date: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  return asUtc - date.getTime();
}

function zonedLocalComponentsToUtcMs(
  local: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  },
  timeZone: string,
): number {
  const desiredAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );

  let utcMs = desiredAsUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offsetMs = getTimeZoneOffsetMs(timeZone, new Date(utcMs));
    const nextUtcMs = desiredAsUtc - offsetMs;

    if (nextUtcMs === utcMs) {
      break;
    }

    utcMs = nextUtcMs;
  }

  return utcMs;
}

/** Interpret a Microsoft Graph calendar dateTime in the given IANA timezone. */
export function parseGraphCalendarDateTime(
  dateTime: string,
  timeZone: string,
): Date {
  const normalized = normalizeGraphDateTimeString(dateTime);

  if (hasExplicitUtcOffset(normalized)) {
    const parsed = new Date(normalized);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/,
  );

  if (!match) {
    const fallback = new Date(normalized);
    return Number.isNaN(fallback.getTime()) ? new Date(0) : fallback;
  }

  const [, year, month, day, hour, minute, second] = match;

  return new Date(
    zonedLocalComponentsToUtcMs(
      {
        year: Number(year),
        month: Number(month),
        day: Number(day),
        hour: Number(hour),
        minute: Number(minute),
        second: Number(second),
      },
      timeZone,
    ),
  );
}

export function formatGraphCalendarLocalDateTime(
  dateTime: string,
  timeZone: string,
): string {
  const date = parseGraphCalendarDateTime(dateTime, timeZone);

  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function getGraphCalendarLocalDate(
  dateTime: string,
  timeZone: string,
): string {
  const date = parseGraphCalendarDateTime(dateTime, timeZone);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
