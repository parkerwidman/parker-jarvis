import {
  isTimeInPast,
  isValidIso8601WithOffset,
  isValidTimeZone,
  isWithinSchedulingHorizon,
  resolveLocalDateTimeInTimeZone,
} from "./datetime-validation";
import {
  normalizeOptionalPlainText,
  sanitizePlainText,
} from "./text-safety";

export const MAX_REMINDER_TITLE_LENGTH = 250;
export const MAX_REMINDER_NOTES_LENGTH = 5000;
export const DEFAULT_REMINDER_DURATION_MINUTES = 15;
export const MIN_REMINDER_DURATION_MINUTES = 1;
export const MAX_REMINDER_DURATION_MINUTES = 240;
export const MIN_REMINDER_OFFSET_MINUTES = 0;
export const MAX_REMINDER_OFFSET_MINUTES = 7 * 24 * 60;

export type ValidatedReminderPayload = {
  title: string;
  remindAt: string;
  timeZone: string;
  notes: string | null;
  durationMinutes: number;
  reminderMinutesBeforeStart: number;
  eventStartDateTime: string;
  eventEndDateTime: string;
};

export type ReminderPayloadValidationResult =
  | { success: true; payload: ValidatedReminderPayload }
  | {
      success: false;
      errorCode: "invalid_action_payload" | "clarification_required";
    };

export function validateReminderPayload(
  payload: unknown,
): ReminderPayloadValidationResult {
  if (typeof payload !== "object" || payload === null) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.title !== "string" || typeof record.remindAt !== "string") {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const title = sanitizePlainText(record.title);

  if (title.length === 0 || title.length > MAX_REMINDER_TITLE_LENGTH) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  let timeZone =
    typeof record.timeZone === "string" ? record.timeZone.trim() : "";

  if (!timeZone) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  if (!isValidTimeZone(timeZone)) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  if (!isValidIso8601WithOffset(record.remindAt)) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const remindAtResolved = resolveLocalDateTimeInTimeZone(
    record.remindAt,
    timeZone,
  );

  if (!remindAtResolved.success) {
    return { success: false, errorCode: remindAtResolved.errorCode };
  }

  if (isTimeInPast(remindAtResolved.instant)) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  if (!isWithinSchedulingHorizon(remindAtResolved.instant)) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  let durationMinutes = DEFAULT_REMINDER_DURATION_MINUTES;

  if (record.durationMinutes !== null && record.durationMinutes !== undefined) {
    if (
      typeof record.durationMinutes !== "number" ||
      !Number.isInteger(record.durationMinutes) ||
      record.durationMinutes < MIN_REMINDER_DURATION_MINUTES ||
      record.durationMinutes > MAX_REMINDER_DURATION_MINUTES
    ) {
      return { success: false, errorCode: "invalid_action_payload" };
    }

    durationMinutes = record.durationMinutes;
  }

  let reminderMinutesBeforeStart = MIN_REMINDER_OFFSET_MINUTES;

  if (
    record.reminderMinutesBeforeStart !== null &&
    record.reminderMinutesBeforeStart !== undefined
  ) {
    if (
      typeof record.reminderMinutesBeforeStart !== "number" ||
      !Number.isInteger(record.reminderMinutesBeforeStart) ||
      record.reminderMinutesBeforeStart < MIN_REMINDER_OFFSET_MINUTES ||
      record.reminderMinutesBeforeStart > MAX_REMINDER_OFFSET_MINUTES
    ) {
      return { success: false, errorCode: "invalid_action_payload" };
    }

    reminderMinutesBeforeStart = record.reminderMinutesBeforeStart;
  }

  const notes = normalizeOptionalPlainText(
    typeof record.notes === "string" ? record.notes : null,
  );

  if (notes && notes.length > MAX_REMINDER_NOTES_LENGTH) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const notificationInstant = remindAtResolved.instant;
  const eventStartInstant = new Date(
    notificationInstant.getTime() +
      reminderMinutesBeforeStart * 60 * 1000,
  );
  const eventEndInstant = new Date(
    eventStartInstant.getTime() + durationMinutes * 60 * 1000,
  );

  if (eventEndInstant.getTime() <= eventStartInstant.getTime()) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  return {
    success: true,
    payload: {
      title,
      remindAt: record.remindAt,
      timeZone,
      notes,
      durationMinutes,
      reminderMinutesBeforeStart,
      eventStartDateTime: eventStartInstant.toISOString(),
      eventEndDateTime: eventEndInstant.toISOString(),
    },
  };
}

export function buildReminderSummary(payload: ValidatedReminderPayload): string {
  return `${payload.title} reminder at ${payload.remindAt} (${payload.timeZone})`;
}
