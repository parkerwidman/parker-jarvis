import {
  microsoftGraphGet,
  microsoftGraphPost,
  microsoftGraphPostDetailed,
} from "@/lib/microsoft/graph-client";
import { MICROSOFT_MAIL_READ_WRITE_SCOPE, MICROSOFT_MAIL_SEND_SCOPE } from "@/lib/microsoft/scopes";
import {
  getMailReadWritePermissionState,
  getMailSendPermissionState,
  recordMailReadWriteMissing,
  recordMailReadWriteVerified,
  recordMailSendMissing,
  recordMailSendVerified,
} from "@/lib/microsoft/token-manager";
import type { ValidatedDirectCalendarEventPayload } from "@/lib/jarvis/action-requests/direct-calendar-action-payload";
import type { ValidatedEmailSendPayload } from "@/lib/jarvis/action-requests/email-send-action-payload";
import type { ValidatedReminderPayload } from "@/lib/jarvis/action-requests/reminder-action-payload";
import {
  logOutlookDraftStageDiagnostic,
  markOutlookDraftReferenceSent,
  resolveOutlookDraftReference,
  storeOutlookDraftReference,
} from "@/lib/jarvis/tools/outlook-draft-references";
import {
  formatGraphCalendarLocalDateTime,
  parseGraphCalendarDateTime,
} from "@/lib/jarvis/tools/graph-calendar-datetime";
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
  importance?: string;
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
  importance: string;
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
      draftKey: string;
      subject: string;
      toRecipients: string[];
      ccRecipients: string[];
      savedToDrafts: true;
      notSent: true;
      message: string;
    }
  | { success: false; outcome: "uncertain" }
  | (MicrosoftToolFailure & {
      microsoftPermissionRequired?: true;
      requiredPermission?: string;
    });

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
  return formatGraphCalendarLocalDateTime(isoString, timeZone);
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

  const startDate = parseGraphCalendarDateTime(event.start.dateTime, timeZone);
  const endDate = parseGraphCalendarDateTime(event.end.dateTime, timeZone);

  return {
    id: event.id,
    subject,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    localStart: formatLocalDateTime(event.start.dateTime, timeZone),
    localEnd: formatLocalDateTime(event.end.dateTime, timeZone),
    timeZone,
    isAllDay: event.isAllDay === true,
    isCancelled: event.isCancelled === true,
    showAs: typeof event.showAs === "string" ? event.showAs : "unknown",
    importance:
      typeof event.importance === "string" ? event.importance : "normal",
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
    "id,subject,start,end,location,organizer,isAllDay,isCancelled,showAs,importance,webLink";
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
    actionRequestId?: string;
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

  const mailReadWriteState = await getMailReadWritePermissionState(
    supabase,
    userId,
  );

  if (mailReadWriteState === "missing") {
    return {
      success: false,
      microsoftPermissionRequired: true,
      requiredPermission: MICROSOFT_MAIL_READ_WRITE_SCOPE,
      error: "Microsoft Mail.ReadWrite permission is required.",
    };
  }

  const draftBody = {
    subject,
    body: {
      contentType: "Text",
      content: body,
    },
    toRecipients: toGraphRecipients(toRecipients),
    ccRecipients: toGraphRecipients(ccRecipients),
  };

  const useDetailedDraft = mailReadWriteState === "unknown";

  if (useDetailedDraft) {
    const graphResult = await microsoftGraphPostDetailed(
      supabase,
      userId,
      "/v1.0/me/messages",
      draftBody,
    );

    return finalizeUnknownStateDraftResult(
      supabase,
      userId,
      graphResult,
      { subject, toRecipients, ccRecipients },
      input.actionRequestId,
    );
  }

  const graphResult = await microsoftGraphPost(
    supabase,
    userId,
    "/v1.0/me/messages",
    draftBody,
  );

  const graphError = mapGraphResult(graphResult);
  if (graphError) {
    return graphError;
  }

  if (!graphResult.success) {
    return { success: false, error: "Could not create Outlook draft." };
  }

  return completeDraftFromGraphResponse(
    supabase,
    userId,
    graphResult.data,
    { subject, toRecipients, ccRecipients },
    input.actionRequestId,
  );
}

async function completeDraftFromGraphResponse(
  supabase: SupabaseClient,
  userId: string,
  data: unknown,
  input: {
    subject: string;
    toRecipients: string[];
    ccRecipients: string[];
  },
  actionRequestId?: string,
): Promise<CreateOutlookDraftResult> {
  const payload = data as GraphMessage;

  if (typeof payload.id !== "string") {
    logOutlookDraftStageDiagnostic({
      stage: "graph_draft_created",
      success: false,
      hasGraphMessageId: false,
      errorCode: "draft_creation_failed",
    });
    return { success: false, error: "Could not create Outlook draft." };
  }

  const graphMessageId = payload.id;

  logOutlookDraftStageDiagnostic({
    stage: "graph_draft_created",
    success: true,
    hasGraphMessageId: true,
  });

  if (!actionRequestId) {
    logOutlookDraftStageDiagnostic({
      stage: "draft_reference_persistence",
      success: false,
      errorCode: "draft_reference_persistence_failed",
      hasGraphMessageId: true,
    });
    return { success: false, outcome: "uncertain" };
  }

  const draftReference = await storeOutlookDraftReference(
    supabase,
    userId,
    graphMessageId,
    actionRequestId,
  );

  if (!draftReference.success) {
    return { success: false, outcome: "uncertain" };
  }

  return {
    success: true,
    draftKey: draftReference.draftKey,
    subject: input.subject,
    toRecipients: input.toRecipients,
    ccRecipients: input.ccRecipients,
    savedToDrafts: true,
    notSent: true,
    message: "The message was saved as a draft in Outlook and was not sent.",
  };
}

async function finalizeUnknownStateDraftResult(
  supabase: SupabaseClient,
  userId: string,
  result:
    | { success: true; data: unknown }
    | { success: false; needsConnection: true }
    | { success: false; needsReconnect: true }
    | { success: false; error: string; failureKind: string },
  input: {
    subject: string;
    toRecipients: string[];
    ccRecipients: string[];
  },
  actionRequestId?: string,
): Promise<CreateOutlookDraftResult> {
  if (result.success) {
    await recordMailReadWriteVerified(supabase, userId);
    return completeDraftFromGraphResponse(
      supabase,
      userId,
      result.data,
      input,
      actionRequestId,
    );
  }

  if ("needsConnection" in result) {
    return { success: false, needsConnection: true };
  }

  if ("needsReconnect" in result) {
    return { success: false, needsReconnect: true };
  }

  if ("failureKind" in result) {
    if (result.failureKind === "permission_denied") {
      await recordMailReadWriteMissing(supabase, userId);

      return {
        success: false,
        microsoftPermissionRequired: true,
        requiredPermission: MICROSOFT_MAIL_READ_WRITE_SCOPE,
        error: "Microsoft Mail.ReadWrite permission is required.",
      };
    }

    if (result.failureKind === "ambiguous") {
      return { success: false, outcome: "uncertain" };
    }
  }

  return { success: false, error: "Could not create Outlook draft." };
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

export async function createOutlookReminder(
  supabase: SupabaseClient,
  userId: string,
  input: {
    transactionId: string;
    payload: ValidatedReminderPayload;
  },
): Promise<
  | { success: true }
  | MicrosoftToolFailure
> {
  const { payload } = input;
  const utcStart = toUtcGraphDateTime(payload.eventStartDateTime);
  const utcEnd = toUtcGraphDateTime(payload.eventEndDateTime);

  const eventBody: Record<string, unknown> = {
    subject: payload.title,
    start: {
      dateTime: utcStart,
      timeZone: "UTC",
    },
    end: {
      dateTime: utcEnd,
      timeZone: "UTC",
    },
    isReminderOn: true,
    reminderMinutesBeforeStart: payload.reminderMinutesBeforeStart,
    showAs: "free",
    sensitivity: "private",
    transactionId: input.transactionId,
  };

  if (payload.notes) {
    eventBody.body = {
      contentType: "Text",
      content: payload.notes,
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
    return { success: false, error: "Could not create Outlook reminder." };
  }

  const response = graphResult.data as GraphEvent;

  if (typeof response.id !== "string") {
    return { success: false, error: "Could not create Outlook reminder." };
  }

  return { success: true };
}

export async function createOutlookCalendarEventDirect(
  supabase: SupabaseClient,
  userId: string,
  input: {
    transactionId: string;
    payload: ValidatedDirectCalendarEventPayload;
  },
): Promise<
  | { success: true }
  | MicrosoftToolFailure
> {
  const { payload } = input;
  const utcStart = toUtcGraphDateTime(payload.startDateTime);
  const utcEnd = toUtcGraphDateTime(payload.endDateTime);

  const eventBody: Record<string, unknown> = {
    subject: payload.subject,
    start: {
      dateTime: utcStart,
      timeZone: "UTC",
    },
    end: {
      dateTime: utcEnd,
      timeZone: "UTC",
    },
    transactionId: input.transactionId,
  };

  if (payload.locationName) {
    eventBody.location = { displayName: payload.locationName };
  }

  if (payload.notes) {
    eventBody.body = {
      contentType: "Text",
      content: payload.notes,
    };
  }

  if (payload.attendees.length > 0) {
    eventBody.attendees = payload.attendees.map((address) => ({
      emailAddress: { address },
      type: "required",
    }));
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

  const response = graphResult.data as GraphEvent;

  if (typeof response.id !== "string") {
    return { success: false, error: "Could not create Outlook calendar event." };
  }

  return { success: true };
}

export type SendOutlookEmailResult =
  | { success: true }
  | { success: false; outcome: "uncertain" }
  | (MicrosoftToolFailure & {
      microsoftPermissionRequired?: true;
      requiredPermission?: string;
    });

export async function sendOutlookEmail(
  supabase: SupabaseClient,
  userId: string,
  input: {
    payload: ValidatedEmailSendPayload;
  },
): Promise<SendOutlookEmailResult> {
  const mailSendState = await getMailSendPermissionState(supabase, userId);

  if (mailSendState === "missing") {
    return {
      success: false,
      microsoftPermissionRequired: true,
      requiredPermission: MICROSOFT_MAIL_SEND_SCOPE,
      error: "Microsoft Mail.Send permission is required.",
    };
  }

  const useDetailedSend = mailSendState === "unknown";

  if (input.payload.draftKey) {
    const draft = await resolveOutlookDraftReference(
      supabase,
      userId,
      input.payload.draftKey,
    );

    if (!draft.success) {
      return { success: false, error: "Could not send Outlook email." };
    }

    const sendPath = `/v1.0/me/messages/${encodeURIComponent(draft.reference.graph_message_id)}/send`;

    if (useDetailedSend) {
      const sendResult = await microsoftGraphPostDetailed(
        supabase,
        userId,
        sendPath,
      );

      return finalizeUnknownStateSendResult(supabase, userId, sendResult, async () => {
        await markOutlookDraftReferenceSent(
          supabase,
          userId,
          input.payload.draftKey!,
        );
      });
    }

    const sendResult = await microsoftGraphPost(supabase, userId, sendPath);

    const graphError = mapGraphResult(sendResult);

    if (graphError) {
      return graphError;
    }

    if (!sendResult.success) {
      return { success: false, error: "Could not send Outlook email." };
    }

    await markOutlookDraftReferenceSent(
      supabase,
      userId,
      input.payload.draftKey,
    );

    return { success: true };
  }

  const messageBody = {
    message: {
      subject: input.payload.subject,
      body: {
        contentType: input.payload.bodyType === "html" ? "HTML" : "Text",
        content: input.payload.body,
      },
      toRecipients: toGraphRecipients(input.payload.to),
      ccRecipients: toGraphRecipients(input.payload.cc),
      bccRecipients: toGraphRecipients(input.payload.bcc),
    },
    saveToSentItems: true,
  };

  if (useDetailedSend) {
    const graphResult = await microsoftGraphPostDetailed(
      supabase,
      userId,
      "/v1.0/me/sendMail",
      messageBody,
    );

    return finalizeUnknownStateSendResult(supabase, userId, graphResult);
  }

  const graphResult = await microsoftGraphPost(
    supabase,
    userId,
    "/v1.0/me/sendMail",
    messageBody,
  );

  const graphError = mapGraphResult(graphResult);

  if (graphError) {
    return graphError;
  }

  if (!graphResult.success) {
    return { success: false, error: "Could not send Outlook email." };
  }

  return { success: true };
}

async function finalizeUnknownStateSendResult(
  supabase: SupabaseClient,
  userId: string,
  result:
    | { success: true; data: unknown }
    | { success: false; needsConnection: true }
    | { success: false; needsReconnect: true }
    | { success: false; error: string; failureKind: string },
  onSuccess?: () => Promise<void>,
): Promise<SendOutlookEmailResult> {
  if (result.success) {
    await recordMailSendVerified(supabase, userId);

    if (onSuccess) {
      await onSuccess();
    }

    return { success: true };
  }

  if ("needsConnection" in result) {
    return { success: false, needsConnection: true };
  }

  if ("needsReconnect" in result) {
    return { success: false, needsReconnect: true };
  }

  if ("failureKind" in result) {
    if (result.failureKind === "permission_denied") {
      await recordMailSendMissing(supabase, userId);

      return {
        success: false,
        microsoftPermissionRequired: true,
        requiredPermission: MICROSOFT_MAIL_SEND_SCOPE,
        error: "Microsoft Mail.Send permission is required.",
      };
    }

    if (result.failureKind === "ambiguous") {
      return { success: false, outcome: "uncertain" };
    }
  }

  return { success: false, error: "Could not send Outlook email." };
}
