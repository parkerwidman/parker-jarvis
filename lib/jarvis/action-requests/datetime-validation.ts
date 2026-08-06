export const ISO8601_OFFSET_PATTERN = /[Zz]|[+-]\d{2}:\d{2}$|[+-]\d{4}$/;

export function isValidIso8601WithOffset(value: string): boolean {
  if (!ISO8601_OFFSET_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function getLocalParts(date: Date, timeZone: string): LocalParts | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });

    const parts = formatter.formatToParts(date);
    const lookup = (type: Intl.DateTimeFormatPartTypes): number => {
      const part = parts.find((item) => item.type === type);
      return part ? Number(part.value) : Number.NaN;
    };

    const year = lookup("year");
    const month = lookup("month");
    const day = lookup("day");
    const hour = lookup("hour");
    const minute = lookup("minute");

    if ([year, month, day, hour, minute].some(Number.isNaN)) {
      return null;
    }

    return { year, month, day, hour, minute };
  } catch {
    return null;
  }
}

export function resolveLocalDateTimeInTimeZone(
  isoString: string,
  timeZone: string,
):
  | { success: true; instant: Date }
  | { success: false; errorCode: "invalid_action_payload" | "clarification_required" } {
  if (!isValidIso8601WithOffset(isoString)) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  if (!isValidTimeZone(timeZone)) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const instant = new Date(isoString);
  const local = getLocalParts(instant, timeZone);

  if (!local) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const roundTrip = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);

  const expected = `${String(local.year).padStart(4, "0")}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}, ${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;

  if (roundTrip !== expected) {
    return { success: false, errorCode: "clarification_required" };
  }

  return { success: true, instant };
}

export function isTimeInPast(instant: Date, now = new Date()): boolean {
  return instant.getTime() <= now.getTime();
}

export const MAX_SCHEDULING_HORIZON_MS = 366 * 24 * 60 * 60 * 1000;

export function isWithinSchedulingHorizon(
  instant: Date,
  now = new Date(),
): boolean {
  return instant.getTime() - now.getTime() <= MAX_SCHEDULING_HORIZON_MS;
}

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailAddress(address: string): boolean {
  return EMAIL_ADDRESS_PATTERN.test(address);
}

export const MAX_EMAIL_RECIPIENTS = 10;
export const MAX_TOTAL_RECIPIENTS = 20;
export const MAX_SUBJECT_LENGTH = 250;
export const MAX_BODY_LENGTH = 20000;

export function normalizeEmailRecipientList(
  addresses: unknown,
  fieldName: string,
  minCount: number,
  maxCount: number,
):
  | { success: true; addresses: string[] }
  | { success: false; errorCode: "invalid_action_payload" | "unsupported_bulk_action" } {
  if (!Array.isArray(addresses)) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  if (addresses.length < minCount || addresses.length > maxCount) {
    if (addresses.length > maxCount) {
      return { success: false, errorCode: "unsupported_bulk_action" };
    }

    return { success: false, errorCode: "invalid_action_payload" };
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const rawAddress of addresses) {
    if (typeof rawAddress !== "string") {
      return { success: false, errorCode: "invalid_action_payload" };
    }

    const address = rawAddress.trim().toLowerCase();

    if (!isValidEmailAddress(address)) {
      return { success: false, errorCode: "invalid_action_payload" };
    }

    if (!seen.has(address)) {
      seen.add(address);
      normalized.push(address);
    }
  }

  if (normalized.length < minCount) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  return { success: true, addresses: normalized };
}
