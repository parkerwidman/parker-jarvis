import {
  normalizeOptionalPlainText,
  sanitizePlainText,
} from "./text-safety";

const ISO8601_OFFSET_PATTERN = /[Zz]|[+-]\d{2}:\d{2}$|[+-]\d{4}$/;
export const MAX_CALENDAR_EVENT_DURATION_MS = 24 * 60 * 60 * 1000;
export const MAX_CALENDAR_SUBJECT_LENGTH = 250;
export const MAX_CALENDAR_LOCATION_LENGTH = 500;
export const MAX_CALENDAR_NOTES_LENGTH = 5000;

export type ValidatedCalendarEventPayload = {
  subject: string;
  startDateTime: string;
  endDateTime: string;
  timeZone: string;
  locationName: string | null;
  notes: string | null;
  dailyPlanId?: string;
  dailyPlanItemKey?: string;
  source?: string;
  reason?: string;
};

export type CalendarPayloadValidationResult =
  | { success: true; payload: ValidatedCalendarEventPayload }
  | { success: false; errorCode: "invalid_action_payload" };

function isValidIso8601WithOffset(value: string): boolean {
  if (!ISO8601_OFFSET_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function validateCalendarEventPayload(
  payload: unknown,
): CalendarPayloadValidationResult {
  if (typeof payload !== "object" || payload === null) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.subject !== "string") {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const subject = sanitizePlainText(record.subject);

  if (subject.length === 0 || subject.length > MAX_CALENDAR_SUBJECT_LENGTH) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  if (
    typeof record.startDateTime !== "string" ||
    typeof record.endDateTime !== "string" ||
    typeof record.timeZone !== "string"
  ) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const { startDateTime, endDateTime, timeZone } = record;

  if (!isValidIso8601WithOffset(startDateTime)) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  if (!isValidIso8601WithOffset(endDateTime)) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const start = new Date(startDateTime);
  const end = new Date(endDateTime);

  if (end <= start) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  if (end.getTime() - start.getTime() > MAX_CALENDAR_EVENT_DURATION_MS) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  if (!isValidTimeZone(timeZone)) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const locationName = normalizeOptionalPlainText(
    typeof record.locationName === "string" ? record.locationName : null,
  );

  if (locationName && locationName.length > MAX_CALENDAR_LOCATION_LENGTH) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const notes = normalizeOptionalPlainText(
    typeof record.notes === "string" ? record.notes : null,
  );

  if (notes && notes.length > MAX_CALENDAR_NOTES_LENGTH) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const validated: ValidatedCalendarEventPayload = {
    subject,
    startDateTime,
    endDateTime,
    timeZone,
    locationName,
    notes,
  };

  if (typeof record.dailyPlanId === "string") {
    validated.dailyPlanId = record.dailyPlanId;
  }
  if (typeof record.dailyPlanItemKey === "string") {
    validated.dailyPlanItemKey = record.dailyPlanItemKey;
  }
  if (typeof record.source === "string") {
    validated.source = record.source;
  }
  if (typeof record.reason === "string") {
    validated.reason = sanitizePlainText(record.reason);
  }

  return { success: true, payload: validated };
}

export function formatLocalDateTime(isoString: string, timeZone: string): string {
  const date = new Date(isoString);

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

export function buildCalendarEventSummary(
  payload: ValidatedCalendarEventPayload,
): string {
  const localStart = formatLocalDateTime(
    payload.startDateTime,
    payload.timeZone,
  );
  const localEnd = formatLocalDateTime(payload.endDateTime, payload.timeZone);

  let summary = `${payload.subject} — ${localStart} to ${localEnd} (${payload.timeZone})`;

  if (payload.locationName) {
    summary += `. Location: ${payload.locationName}`;
  }

  return summary;
}

export function normalizeCalendarPayloadForDedup(
  payload: ValidatedCalendarEventPayload,
): Record<string, unknown> {
  return {
    subject: payload.subject,
    startDateTime: payload.startDateTime,
    endDateTime: payload.endDateTime,
    timeZone: payload.timeZone,
    locationName: payload.locationName,
    notes: payload.notes,
  };
}
