export function getMondayZeroDayOfWeek(localDate: string): number {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const jsDay = date.getUTCDay();

  return jsDay === 0 ? 6 : jsDay - 1;
}

export function isDateInInclusiveRange(
  date: string,
  startDate: string,
  endDate: string,
): boolean {
  return date >= startDate && date <= endDate;
}

export function addDaysToLocalDate(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

export function iterateLocalDatesInclusive(
  startDate: string,
  endDate: string,
): string[] {
  const dates: string[] = [];
  let current = startDate;

  while (current <= endDate) {
    dates.push(current);
    current = addDaysToLocalDate(current, 1);
  }

  return dates;
}

function normalizeLocalTime(localTime: string): string {
  const parts = localTime.split(":");

  if (parts.length === 2) {
    return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}:00`;
  }

  if (parts.length === 3) {
    return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}:${parts[2].padStart(2, "0")}`;
  }

  throw new Error(`Invalid local time: ${localTime}`);
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

function getLocalMinute(timeZone: string, date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      minute: "numeric",
    }).format(date),
  );
}

function getLocalDateString(timeZone: string, date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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

export function localDateTimeToIso(
  localDate: string,
  localTime: string,
  timeZone: string,
): string {
  const normalizedTime = normalizeLocalTime(localTime);
  const [hour, minute, second] = normalizedTime.split(":").map(Number);
  const midnightMs = localMidnightUtcMs(localDate, timeZone);
  const targetMinutes = hour * 60 + minute + second / 60;

  for (let offsetMinutes = targetMinutes - 180; offsetMinutes <= targetMinutes + 180; offsetMinutes += 1) {
    const candidate = new Date(midnightMs + offsetMinutes * 60 * 1000);
    const candidateDate = getLocalDateString(timeZone, candidate);
    const candidateHour = getLocalHour(timeZone, candidate);
    const candidateMinute = getLocalMinute(timeZone, candidate);

    if (
      candidateDate === localDate &&
      candidateHour === hour &&
      candidateMinute === minute
    ) {
      return candidate.toISOString();
    }
  }

  throw new Error(
    `Could not resolve local datetime ${localDate} ${normalizedTime} in ${timeZone}`,
  );
}

export function compareTimeStrings(left: string, right: string): number {
  const leftNormalized = normalizeLocalTime(left);
  const rightNormalized = normalizeLocalTime(right);

  if (leftNormalized < rightNormalized) {
    return -1;
  }

  if (leftNormalized > rightNormalized) {
    return 1;
  }

  return 0;
}

export function normalizeTimeForStorage(localTime: string): string {
  return normalizeLocalTime(localTime).slice(0, 8);
}
