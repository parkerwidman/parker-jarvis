export type MorningBriefCalendarEventMetadata = {
  subject: string;
  localDate: string;
  localStart: string;
  localEnd: string;
  startIso: string;
  endIso: string;
  isAllDay: boolean;
  isCancelled: boolean;
  showAs?: string | null;
  importance?: string | null;
  locationName?: string | null;
};

const REMINDER_TITLE_PATTERN =
  /^(?:reminder|alert|notification|ping)(?:\s|:|$)/i;

const GENERIC_REMINDER_PATTERN =
  /\b(?:test\s+reminder|reminder\s+only|notification\s+placeholder|simple\s+reminder)\b/i;

const INTERNAL_CALENDAR_EVENT_PATTERN =
  /\b(?:test\s+approval\s+workflow|approval\s+workflow(?:\s+test)?|jarvis|plaid|oauth|cron(?:\s+job)?|integration\s+test|microsoft\s+(?:oauth|reconnect|test)|connection\s+test|workflow\s+test)\b/i;

const MEANINGFUL_CALENDAR_TITLE_PATTERN =
  /\b(?:class|lecture|lab|section|meeting|appointment|interview|sync|standup|stand-up|office hours|travel|flight|dentist|doctor|therapy|work block|focus time|deadline|presentation|exam|midterm|final|reservation|check-in|check in)\b/i;

const MIN_MEANINGFUL_DURATION_MS = 30 * 60 * 1000;

function eventDurationMs(event: MorningBriefCalendarEventMetadata): number {
  const start = new Date(event.startIso).getTime();
  const end = new Date(event.endIso).getTime();

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return 0;
  }

  return Math.max(0, end - start);
}

function isShortReminderDuration(event: MorningBriefCalendarEventMetadata): boolean {
  return eventDurationMs(event) <= 15 * 60 * 1000;
}

export function isReminderOnlyCalendarEvent(
  event: MorningBriefCalendarEventMetadata,
): boolean {
  const subject = event.subject.trim();

  if (!subject || subject === "(No subject)") {
    return true;
  }

  if (/^reminder$/i.test(subject)) {
    return true;
  }

  if (REMINDER_TITLE_PATTERN.test(subject)) {
    return true;
  }

  if (GENERIC_REMINDER_PATTERN.test(subject)) {
    return true;
  }

  if (
    !event.isAllDay &&
    isShortReminderDuration(event) &&
    subject.length <= 24 &&
    /\bremind/i.test(subject)
  ) {
    return true;
  }

  return false;
}

export function isInternalCalendarTestEvent(subject: string): boolean {
  return INTERNAL_CALENDAR_EVENT_PATTERN.test(subject);
}

export function isMeaningfulMorningBriefCalendarEvent(
  event: MorningBriefCalendarEventMetadata,
): boolean {
  if (event.isCancelled) {
    return false;
  }

  const showAs = event.showAs?.trim().toLowerCase();

  if (showAs === "free" || showAs === "tentative") {
    return false;
  }

  if (isReminderOnlyCalendarEvent(event)) {
    return false;
  }

  if (isInternalCalendarTestEvent(event.subject)) {
    return false;
  }

  if (event.importance?.trim().toLowerCase() === "high") {
    return true;
  }

  if (
    showAs === "busy" ||
    showAs === "workingelsewhere" ||
    showAs === "oof"
  ) {
    return true;
  }

  if (event.isAllDay) {
    return true;
  }

  if (MEANINGFUL_CALENDAR_TITLE_PATTERN.test(event.subject)) {
    return true;
  }

  if (event.locationName?.trim()) {
    return true;
  }

  if (eventDurationMs(event) >= MIN_MEANINGFUL_DURATION_MS) {
    return true;
  }

  return false;
}

export function calendarEventDedupeKey(
  event: MorningBriefCalendarEventMetadata,
): string {
  return [
    event.localDate,
    event.subject.trim().toLowerCase(),
    event.localStart.trim().toLowerCase(),
  ].join("|");
}

export function dedupeMorningBriefCalendarEvents<
  T extends MorningBriefCalendarEventMetadata,
>(events: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const event of events) {
    const key = calendarEventDedupeKey(event);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(event);
  }

  return deduped;
}
