import {
  MAX_CALENDAR_EVENT_DURATION_MS,
  MAX_CALENDAR_LOCATION_LENGTH,
  MAX_CALENDAR_NOTES_LENGTH,
  MAX_CALENDAR_SUBJECT_LENGTH,
  validateCalendarEventPayload,
  type ValidatedCalendarEventPayload,
} from "./calendar-action-payload";
import {
  isValidEmailAddress,
  MAX_EMAIL_RECIPIENTS,
} from "./datetime-validation";
import {
  normalizeOptionalPlainText,
  sanitizePlainText,
} from "./text-safety";

export type ValidatedDirectCalendarEventPayload = ValidatedCalendarEventPayload & {
  attendees: string[];
};

export type DirectCalendarPayloadValidationResult =
  | { success: true; payload: ValidatedDirectCalendarEventPayload }
  | {
      success: false;
      errorCode: "invalid_action_payload" | "clarification_required";
    };

function normalizeAttendees(value: unknown):
  | { success: true; attendees: string[] }
  | { success: false; errorCode: "invalid_action_payload" | "clarification_required" } {
  if (value === null || value === undefined) {
    return { success: true, attendees: [] };
  }

  if (!Array.isArray(value)) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  if (value.length > MAX_EMAIL_RECIPIENTS) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const attendees: string[] = [];
  const seen = new Set<string>();

  for (const raw of value) {
    if (typeof raw !== "string") {
      return { success: false, errorCode: "clarification_required" };
    }

    const trimmed = raw.trim();

    if (trimmed.length === 0) {
      return { success: false, errorCode: "clarification_required" };
    }

    if (!isValidEmailAddress(trimmed.toLowerCase())) {
      return { success: false, errorCode: "clarification_required" };
    }

    const normalized = trimmed.toLowerCase();

    if (!seen.has(normalized)) {
      seen.add(normalized);
      attendees.push(normalized);
    }
  }

  return { success: true, attendees };
}

export function validateDirectCalendarEventPayload(
  payload: unknown,
): DirectCalendarPayloadValidationResult {
  const base = validateCalendarEventPayload(payload);

  if (!base.success) {
    return base;
  }

  const record =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : {};

  const attendeeResult = normalizeAttendees(record.attendees);

  if (!attendeeResult.success) {
    return { success: false, errorCode: attendeeResult.errorCode };
  }

  return {
    success: true,
    payload: {
      ...base.payload,
      attendees: attendeeResult.attendees,
    },
  };
}

export function buildDirectCalendarSummary(
  payload: ValidatedDirectCalendarEventPayload,
): string {
  let summary = payload.subject;

  if (payload.attendees.length > 0) {
    summary += ` with ${payload.attendees.length} attendee(s)`;
  }

  return summary;
}

export {
  MAX_CALENDAR_EVENT_DURATION_MS,
  MAX_CALENDAR_LOCATION_LENGTH,
  MAX_CALENDAR_NOTES_LENGTH,
  MAX_CALENDAR_SUBJECT_LENGTH,
};
