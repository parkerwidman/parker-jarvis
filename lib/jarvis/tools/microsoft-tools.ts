import { microsoftGraphGet, microsoftGraphPost } from "@/lib/microsoft/graph-client";
import type { SupabaseClient } from "@supabase/supabase-js";

const ISO8601_OFFSET_PATTERN = /[Zz]|[+-]\d{2}:\d{2}$|[+-]\d{4}$/;
const MAX_CALENDAR_RANGE_MS = 31 * 24 * 60 * 60 * 1000;
const MAX_SUBJECT_LENGTH = 250;
const MAX_BODY_LENGTH = 20000;
const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type GraphEmailAddress = {
  name?: string;
  address?: string;
};

type GraphRecipient = {
  emailAddress?: GraphEmailAddress;
};

type GraphMessage = {
  id?: string;
  subject?: string;
  from?: GraphRecipient;
  receivedDateTime?: string;
  isRead?: boolean;
  importance?: string;
  bodyPreview?: string;
  webLink?: string;
};

type GraphDateTimeTimeZone = {
  dateTime?: string;
  timeZone?: string;
};

type GraphLocation = {
  displayName?: string;
};

type GraphOrganizer = {
  emailAddress?: GraphEmailAddress;
};

type GraphEvent = {
  id?: string;
  subject?: string;
  start?: GraphDateTimeTimeZone;
  end?: GraphDateTimeTimeZone;
  location?: GraphLocation;
  organizer?: GraphOrganizer;
  isAllDay?: boolean;
  isCancelled?: boolean;
  showAs?: string;
  webLink?: string;
};

type GraphListResponse<T> = {
  value?: T[];
  "@odata.nextLink"?: string;
};

export type OutlookMessage = {
  id: string;
  subject: string;
  senderName: string | null;
  senderAddress: string | null;
  receivedDateTime: string;
  isRead: boolean;
  outlookImportance: string;
  bodyPreview: string;
  webLink: string | null;
};

export type OutlookEvent = {
  id: string;
  subject: string;
  start: string;
  end: string;
  localStart: string;
  localEnd: string;
  timeZone: string;
  isAllDay: boolean;
  isCancelled: boolean;
  showAs: string;
  locationName: string | null;
  organizerName: string | null;
  organizerAddress: string | null;
  webLink: string | null;
};

export type MicrosoftToolFailure =
  | { success: false; needsConnection: true }
  | { success: false; needsReconnect: true }
  | { success: false; error: string };

export type ListOutlookInboxResult =
  | {
      success: true;
      messages: OutlookMessage[];
      note: string;
    }
  | MicrosoftToolFailure;

export type ListOutlookCalendarResult =
  | {
      success: true;
      events: OutlookEvent[];
      truncated: boolean;
    }
  | MicrosoftToolFailure;

export type CreateOutlookDraftResult =
  | {
      success: true;
      draftId: string;
      subject: string;
      toRecipients: string[];
      ccRecipients: string[];
      webLink: string | null;
      savedToDrafts: true;
    }
  | MicrosoftToolFailure;

export type CreateOutlookCalendarEventResult =
  | {
      success: true;
      eventId: string;
      subject: string;
      start: string;
      end: string;
      webLink: string | null;
    }
  | MicrosoftToolFailure;

const MAX_EVENT_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_LOCATION_LENGTH = 500;
const MAX_NOTES_LENGTH = 5000;

function mapGraphResult(
  result:
    | { success: true; data: unknown }
    | { success: false; needsConnection: true }
    | { success: false; needsReconnect: true }
    | { success: false; error: string },
): MicrosoftToolFailure | null {
  if (result.success) {
    return null;
  }

  if ("needsConnection" in result) {
    return { success: false, needsConnection: true };
  }

  if ("needsReconnect" in result) {
    return { success: false, needsReconnect: true };
  }

  return { success: false, error: result.error };
}

function isValidEmailAddress(address: string): boolean {
  return EMAIL_ADDRESS_PATTERN.test(address);
}

function normalizeRecipientList(
  addresses: string[],
  fieldName: string,
  minCount: number,
  maxCount: number,
): { success: true; addresses: string[] } | { success: false; error: string } {
  if (!Array.isArray(addresses)) {
    return {
      success: false,
      error: `${fieldName} must be an array of email addresses.`,
    };
  }

  if (addresses.length < minCount || addresses.length > maxCount) {
    return {
      success: false,
      error: `${fieldName} must contain ${minCount} through ${maxCount} email addresses.`,
    };
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const rawAddress of addresses) {
    if (typeof rawAddress !== "string") {
      return {
        success: false,
        error: `${fieldName} must contain valid email address strings.`,
      };
    }

    const address = rawAddress.trim().toLowerCase();

    if (!isValidEmailAddress(address)) {
      return {
        success: false,
        error: `Invalid email address in ${fieldName}.`,
      };
    }

    if (!seen.has(address)) {
      seen.add(address);
      normalized.push(address);
    }
  }

  if (normalized.length < minCount) {
    return {
      success: false,
      error: `${fieldName} must contain ${minCount} through ${maxCount} unique email addresses.`,
    };
  }

  return { success: true, addresses: normalized };
}

function toGraphRecipients(addresses: string[]): GraphRecipient[] {
  return addresses.map((address) => ({
    emailAddress: { address },
  }));
}

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

function normalizeMessage(message: GraphMessage): OutlookMessage | null {
  if (typeof message.id !== "string" || typeof message.receivedDateTime !== "string") {
    return null;
  }

  const subject =
    typeof message.subject === "string" && message.subject.trim().length > 0
      ? message.subject
      : "(No subject)";

  return {
    id: message.id,
    subject,
    senderName:
      typeof message.from?.emailAddress?.name === "string"
        ? message.from.emailAddress.name
        : null,
    senderAddress:
      typeof message.from?.emailAddress?.address === "string"
        ? message.from.emailAddress.address
        : null,
    receivedDateTime: message.receivedDateTime,
    isRead: message.isRead === true,
    outlookImportance:
      typeof message.importance === "string" ? message.importance : "normal",
    bodyPreview:
      typeof message.bodyPreview === "string" ? message.bodyPreview : "",
    webLink: typeof message.webLink === "string" ? message.webLink : null,
  };
}

function normalizeEvent(
  event: GraphEvent,
  timeZone: string,
): OutlookEvent | null {
  if (
    typeof event.id !== "string" ||
    typeof event.start?.dateTime !== "string" ||
    typeof event.end?.dateTime !== "string"
  ) {
    return null;
  }

  const subject =
    typeof event.subject === "string" && event.subject.trim().length > 0
      ? event.subject
      : "(No subject)";

  return {
    id: event.id,
    subject,
    start: event.start.dateTime,
    end: event.end.dateTime,
    localStart: formatLocalDateTime(event.start.dateTime, timeZone),
    localEnd: formatLocalDateTime(event.end.dateTime, timeZone),
    timeZone,
    isAllDay: event.isAllDay === true,
    isCancelled: event.isCancelled === true,
    showAs: typeof event.showAs === "string" ? event.showAs : "unknown",
    locationName:
      typeof event.location?.displayName === "string"
        ? event.location.displayName
        : null,
    organizerName:
      typeof event.organizer?.emailAddress?.name === "string"
        ? event.organizer.emailAddress.name
        : null,
    organizerAddress:
      typeof event.organizer?.emailAddress?.address === "string"
        ? event.organizer.emailAddress.address
        : null,
    webLink: typeof event.webLink === "string" ? event.webLink : null,
  };
}

export async function listOutlookInbox(
  supabase: SupabaseClient,
  userId: string,
  input: { limit: number; unreadOnly: boolean },
): Promise<ListOutlookInboxResult> {
  const limit = input.limit;

  if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
    return {
      success: false,
      error: "Limit must be an integer from 1 through 25.",
    };
  }

  const select =
    "id,subject,from,receivedDateTime,isRead,importance,bodyPreview,webLink";
  const path = `/v1.0/me/mailFolders/inbox/messages?$top=50&$orderby=${encodeURIComponent("receivedDateTime desc")}&$select=${encodeURIComponent(select)}`;

  const graphResult = await microsoftGraphGet(supabase, userId, path);

  const graphError = mapGraphResult(graphResult);
  if (graphError) {
    return graphError;
  }

  if (!graphResult.success) {
    return { success: false, error: "Could not retrieve inbox messages." };
  }

  const payload = graphResult.data as GraphListResponse<GraphMessage>;
  let messages = (payload.value ?? [])
    .map(normalizeMessage)
    .filter((message): message is OutlookMessage => message !== null);

  if (input.unreadOnly) {
    messages = messages.filter((message) => !message.isRead);
  }

  return {
    success: true,
    messages: messages.slice(0, limit),
    note: "bodyPreview is a short excerpt only and is not the full email body.",
  };
}

export async function listOutlookCalendar(
  supabase: SupabaseClient,
  userId: string,
  input: { startDateTime: string; endDateTime: string; timeZone: string },
): Promise<ListOutlookCalendarResult> {
  const { startDateTime, endDateTime, timeZone } = input;

  if (!isValidIso8601WithOffset(startDateTime)) {
    return {
      success: false,
      error:
        "startDateTime must be a valid ISO 8601 string with Z or an explicit UTC offset.",
    };
  }

  if (!isValidIso8601WithOffset(endDateTime)) {
    return {
      success: false,
      error:
        "endDateTime must be a valid ISO 8601 string with Z or an explicit UTC offset.",
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

  if (end.getTime() - start.getTime() > MAX_CALENDAR_RANGE_MS) {
    return {
      success: false,
      error: "The calendar range cannot exceed 31 days.",
    };
  }

  if (!isValidTimeZone(timeZone)) {
    return {
      success: false,
      error: "timeZone must be a valid IANA timezone string.",
    };
  }

  const select =
    "id,subject,start,end,location,organizer,isAllDay,isCancelled,showAs,webLink";
  const path = `/v1.0/me/calendarView?startDateTime=${encodeURIComponent(startDateTime)}&endDateTime=${encodeURIComponent(endDateTime)}&$top=100&$orderby=${encodeURIComponent("start/dateTime")}&$select=${encodeURIComponent(select)}`;

  const graphResult = await microsoftGraphGet(supabase, userId, path);

  const graphError = mapGraphResult(graphResult);
  if (graphError) {
    return graphError;
  }

  if (!graphResult.success) {
    return { success: false, error: "Could not retrieve calendar events." };
  }

  const payload = graphResult.data as GraphListResponse<GraphEvent>;
  const events = (payload.value ?? [])
    .map((event) => normalizeEvent(event, timeZone))
    .filter((event): event is OutlookEvent => event !== null);

  return {
    success: true,
    events,
    truncated: typeof payload["@odata.nextLink"] === "string",
  };
}

export async function createOutlookDraft(
  supabase: SupabaseClient,
  userId: string,
  input: {
    toRecipients: string[];
    ccRecipients: string[];
    subject: string;
    body: string;
  },
): Promise<CreateOutlookDraftResult> {
  const toResult = normalizeRecipientList(
    input.toRecipients,
    "toRecipients",
    1,
    10,
  );
  if (!toResult.success) {
    return { success: false, error: toResult.error };
  }

  const ccResult = normalizeRecipientList(
    input.ccRecipients,
    "ccRecipients",
    0,
    10,
  );
  if (!ccResult.success) {
    return { success: false, error: ccResult.error };
  }

  const toRecipients = toResult.addresses;
  const ccRecipients = ccResult.addresses;

  const toSet = new Set(toRecipients);
  for (const address of ccRecipients) {
    if (toSet.has(address)) {
      return {
        success: false,
        error: "The same email address cannot appear in both To and CC.",
      };
    }
  }

  const subject = input.subject.trim();
  const body = input.body.trim();

  if (subject.length === 0) {
    return { success: false, error: "Subject cannot be empty." };
  }

  if (subject.length > MAX_SUBJECT_LENGTH) {
    return {
      success: false,
      error: `Subject cannot exceed ${MAX_SUBJECT_LENGTH} characters.`,
    };
  }

  if (body.length === 0) {
    return { success: false, error: "Body cannot be empty." };
  }

  if (body.length > MAX_BODY_LENGTH) {
    return {
      success: false,
      error: `Body cannot exceed ${MAX_BODY_LENGTH} characters.`,
    };
  }

  const graphResult = await microsoftGraphPost(
    supabase,
    userId,
    "/v1.0/me/messages",
    {
      subject,
      body: {
        contentType: "Text",
        content: body,
      },
      toRecipients: toGraphRecipients(toRecipients),
      ccRecipients: toGraphRecipients(ccRecipients),
    },
  );

  const graphError = mapGraphResult(graphResult);
  if (graphError) {
    return graphError;
  }

  if (!graphResult.success) {
    return { success: false, error: "Could not create Outlook draft." };
  }

  const payload = graphResult.data as GraphMessage;

  if (typeof payload.id !== "string") {
    return { success: false, error: "Could not create Outlook draft." };
  }

  return {
    success: true,
    draftId: payload.id,
    subject,
    toRecipients,
    ccRecipients,
    webLink: typeof payload.webLink === "string" ? payload.webLink : null,
    savedToDrafts: true,
  };
}

function toUtcGraphDateTime(isoString: string): string {
  return new Date(isoString).toISOString().slice(0, 19);
}

export async function createOutlookCalendarEvent(
  supabase: SupabaseClient,
  userId: string,
  input: {
    actionRequestId: string;
    subject: string;
    startDateTime: string;
    endDateTime: string;
    locationName: string | null;
    notes: string | null;
  },
): Promise<CreateOutlookCalendarEventResult> {
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

  const { startDateTime, endDateTime } = input;

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

  const locationName =
    typeof input.locationName === "string" && input.locationName.trim().length > 0
      ? input.locationName.trim()
      : null;

  const notes =
    typeof input.notes === "string" && input.notes.trim().length > 0
      ? input.notes.trim()
      : null;

  if (locationName && locationName.length > MAX_LOCATION_LENGTH) {
    return {
      success: false,
      error: `locationName cannot exceed ${MAX_LOCATION_LENGTH} characters.`,
    };
  }

  if (notes && notes.length > MAX_NOTES_LENGTH) {
    return {
      success: false,
      error: `notes cannot exceed ${MAX_NOTES_LENGTH} characters.`,
    };
  }

  const utcStart = toUtcGraphDateTime(startDateTime);
  const utcEnd = toUtcGraphDateTime(endDateTime);

  const eventBody: Record<string, unknown> = {
    subject,
    start: {
      dateTime: utcStart,
      timeZone: "UTC",
    },
    end: {
      dateTime: utcEnd,
      timeZone: "UTC",
    },
    transactionId: input.actionRequestId,
  };

  if (locationName) {
    eventBody.location = { displayName: locationName };
  }

  if (notes) {
    eventBody.body = {
      contentType: "Text",
      content: notes,
    };
  }

  const graphResult = await microsoftGraphPost(
    supabase,
    userId,
    "/v1.0/me/events",
    eventBody,
  );

  const graphError = mapGraphResult(graphResult);
  if (graphError) {
    return graphError;
  }

  if (!graphResult.success) {
    return { success: false, error: "Could not create Outlook calendar event." };
  }

  const payload = graphResult.data as GraphEvent;

  if (typeof payload.id !== "string") {
    return { success: false, error: "Could not create Outlook calendar event." };
  }

  return {
    success: true,
    eventId: payload.id,
    subject,
    start: utcStart,
    end: utcEnd,
    webLink: typeof payload.webLink === "string" ? payload.webLink : null,
  };
}
