import { microsoftGraphGet } from "@/lib/microsoft/graph-client";
import type { SupabaseClient } from "@supabase/supabase-js";

const ISO8601_OFFSET_PATTERN = /[Zz]|[+-]\d{2}:\d{2}$|[+-]\d{4}$/;
const MAX_CALENDAR_RANGE_MS = 31 * 24 * 60 * 60 * 1000;

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

export type ListOutlookInboxResult =
  | {
      success: true;
      messages: OutlookMessage[];
      note: string;
    }
  | { success: false; needsConnection: true }
  | { success: false; needsReconnect: true }
  | { success: false; error: string };

export type ListOutlookCalendarResult =
  | {
      success: true;
      events: OutlookEvent[];
      truncated: boolean;
    }
  | { success: false; needsConnection: true }
  | { success: false; needsReconnect: true }
  | { success: false; error: string };

function mapGraphResult<T extends { needsConnection?: true; needsReconnect?: true; error?: string }>(
  result:
    | { success: true; data: unknown }
    | { success: false; needsConnection: true }
    | { success: false; needsReconnect: true }
    | { success: false; error: string },
): T | null {
  if (result.success) {
    return null;
  }

  if ("needsConnection" in result) {
    return { success: false, needsConnection: true } as T;
  }

  if ("needsReconnect" in result) {
    return { success: false, needsReconnect: true } as T;
  }

  return { success: false, error: result.error } as T;
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

  const graphError = mapGraphResult<ListOutlookInboxResult>(graphResult);
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

  const graphError = mapGraphResult<ListOutlookCalendarResult>(graphResult);
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
