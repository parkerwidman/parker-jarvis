import type { SupabaseClient } from "@supabase/supabase-js";

const ISO8601_OFFSET_PATTERN = /[Zz]|[+-]\d{2}:\d{2}$|[+-]\d{4}$/;
const MAX_EVENT_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_SUBJECT_LENGTH = 250;
const MAX_LOCATION_LENGTH = 500;
const MAX_NOTES_LENGTH = 5000;

const VALID_STATUSES = new Set([
  "pending",
  "approved",
  "executing",
  "completed",
  "rejected",
  "failed",
  "expired",
]);

const ACTION_REQUEST_SELECT =
  "id, action_type, status, risk_level, title, summary, expires_at, created_at, result, safe_error_message";

export type ActionRequestRecord = {
  id: string;
  action_type: string;
  status: string;
  risk_level: string;
  title: string;
  summary: string;
  expires_at: string | null;
  created_at: string;
  result: unknown;
  safe_error_message: string | null;
};

export type ProposeOutlookCalendarEventResult =
  | {
      success: true;
      actionRequestId: string;
      status: string;
      title: string;
      summary: string;
      expiresAt: string;
    }
  | { success: false; error: string };

export type ListActionRequestsResult =
  | { success: true; actionRequests: ActionRequestRecord[] }
  | { success: false; error: string };

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

function formatLocalDateTime(isoString: string, timeZone: string): string {
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

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildCalendarEventSummary(input: {
  subject: string;
  startDateTime: string;
  endDateTime: string;
  timeZone: string;
  locationName: string | null;
}): string {
  const localStart = formatLocalDateTime(input.startDateTime, input.timeZone);
  const localEnd = formatLocalDateTime(input.endDateTime, input.timeZone);

  let summary = `${input.subject} — ${localStart} to ${localEnd} (${input.timeZone})`;

  if (input.locationName) {
    summary += `. Location: ${input.locationName}`;
  }

  return summary;
}

export async function proposeOutlookCalendarEvent(
  supabase: SupabaseClient,
  userId: string,
  input: {
    subject: string;
    startDateTime: string;
    endDateTime: string;
    timeZone: string;
    locationName: string | null;
    notes: string | null;
  },
): Promise<ProposeOutlookCalendarEventResult> {
  const subject = input.subject.trim();

  if (subject.length === 0) {
    return { success: false, error: "Subject is required." };
  }

  if (subject.length > MAX_SUBJECT_LENGTH) {
    return {
      success: false,
      error: `Subject cannot exceed ${MAX_SUBJECT_LENGTH} characters.`,
    };
  }

  const { startDateTime, endDateTime, timeZone } = input;

  if (!isValidIso8601WithOffset(startDateTime)) {
    return {
      success: false,
      error:
        "startDateTime must be a valid ISO 8601 string with Z or an explicit numeric offset.",
    };
  }

  if (!isValidIso8601WithOffset(endDateTime)) {
    return {
      success: false,
      error:
        "endDateTime must be a valid ISO 8601 string with Z or an explicit numeric offset.",
    };
  }

  const start = new Date(startDateTime);
  const end = new Date(endDateTime);

  if (end <= start) {
    return {
      success: false,
      error: "endDateTime must be after startDateTime.",
    };
  }

  if (end.getTime() - start.getTime() > MAX_EVENT_DURATION_MS) {
    return {
      success: false,
      error: "The event cannot exceed 24 hours.",
    };
  }

  if (!isValidTimeZone(timeZone)) {
    return {
      success: false,
      error: "timeZone must be a valid IANA timezone string.",
    };
  }

  if (
    input.locationName !== null &&
    input.locationName !== undefined &&
    input.locationName.trim().length > MAX_LOCATION_LENGTH
  ) {
    return {
      success: false,
      error: `locationName cannot exceed ${MAX_LOCATION_LENGTH} characters.`,
    };
  }

  if (
    input.notes !== null &&
    input.notes !== undefined &&
    input.notes.trim().length > MAX_NOTES_LENGTH
  ) {
    return {
      success: false,
      error: `notes cannot exceed ${MAX_NOTES_LENGTH} characters.`,
    };
  }

  const locationName = normalizeOptionalString(input.locationName);
  const notes = normalizeOptionalString(input.notes);

  const summary = buildCalendarEventSummary({
    subject,
    startDateTime,
    endDateTime,
    timeZone,
    locationName,
  });

  const payload = {
    subject,
    startDateTime,
    endDateTime,
    timeZone,
    locationName,
    notes,
  };

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("action_requests")
    .insert({
      user_id: userId,
      action_type: "create_outlook_calendar_event",
      status: "pending",
      risk_level: "approval_required",
      title: "Create Outlook calendar event",
      summary,
      payload,
      expires_at: expiresAt,
    })
    .select("id, status, title, summary, expires_at")
    .single();

  if (error || !data) {
    return { success: false, error: "Could not create approval request." };
  }

  return {
    success: true,
    actionRequestId: data.id,
    status: data.status,
    title: data.title,
    summary: data.summary,
    expiresAt: data.expires_at,
  };
}

export async function listActionRequests(
  supabase: SupabaseClient,
  userId: string,
  input?: { status?: string },
): Promise<ListActionRequestsResult> {
  const statusFilter = input?.status?.trim();

  if (statusFilter && !VALID_STATUSES.has(statusFilter)) {
    return {
      success: false,
      error:
        "status must be one of: pending, approved, executing, completed, rejected, failed, expired.",
    };
  }

  let query = supabase
    .from("action_requests")
    .select(ACTION_REQUEST_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Could not list action requests." };
  }

  return { success: true, actionRequests: data ?? [] };
}
