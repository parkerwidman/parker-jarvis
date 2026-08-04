import type { PlanItem } from "./generate-daily-plan";
import { isValidSuggestedPlanItem } from "./generate-daily-plan";

const CALENDAR_NOTES_MAX = 500;
const CALENDAR_CONTEXT_MAX = 150;

const BLOCKING_REQUEST_STATUSES = new Set([
  "pending",
  "approved",
  "executing",
  "completed",
]);

export type DailyPlanCalendarPayload = {
  subject?: string;
  startDateTime?: string;
  endDateTime?: string;
  timeZone?: string;
  locationName?: string | null;
  notes?: string | null;
  dailyPlanId?: string;
  dailyPlanItemKey?: string;
  source?: string;
  reason?: string;
};

export function buildDailyPlanItemKey(
  planId: string,
  item: Pick<PlanItem, "startTime" | "endTime" | "title">,
): string {
  return `${planId}:${item.startTime}:${item.endTime}:${item.title}`;
}

function truncateCalendarContext(text: string): string {
  const trimmed = text.trim();

  if (trimmed.length <= CALENDAR_CONTEXT_MAX) {
    return trimmed;
  }

  return `${trimmed.slice(0, CALENDAR_CONTEXT_MAX).trimEnd()}…`;
}

export function buildDailyPlanCalendarNotes(item: PlanItem): string | null {
  const parts: string[] = [];

  if (item.reason.trim()) {
    parts.push(item.reason.trim());
  }

  const context = item.projectContext;

  if (context?.recordedBlocker) {
    parts.push(
      `Recorded blocker: ${truncateCalendarContext(context.recordedBlocker)}`,
    );
  }

  if (context?.recordedDecision) {
    parts.push(
      `Recorded decision: ${truncateCalendarContext(context.recordedDecision)}`,
    );
  }

  if (parts.length === 0) {
    return null;
  }

  const combined = parts.join("\n");

  if (combined.length <= CALENDAR_NOTES_MAX) {
    return combined;
  }

  return `${combined.slice(0, CALENDAR_NOTES_MAX).trimEnd()}…`;
}

export function isProposableSuggestedPlanItem(
  item: unknown,
  now = new Date(),
): item is PlanItem {
  if (!isValidSuggestedPlanItem(item)) {
    return false;
  }

  if (new Date(item.startTime).getTime() <= now.getTime()) {
    return false;
  }

  return true;
}

export function isBlockingCalendarRequestStatus(status: string): boolean {
  return BLOCKING_REQUEST_STATUSES.has(status);
}

export function parseDailyPlanItemKeyFromPayload(
  payload: unknown,
): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const key = (payload as DailyPlanCalendarPayload).dailyPlanItemKey;
  return typeof key === "string" && key.length > 0 ? key : null;
}

export function parseDailyPlanCalendarPayload(
  payload: unknown,
): DailyPlanCalendarPayload | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  return payload as DailyPlanCalendarPayload;
}

export function getDailyPlanItemRequestStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Pending approval";
    case "approved":
      return "Approved";
    case "executing":
      return "Executing";
    case "completed":
      return "Scheduled";
    case "failed":
      return "Failed";
    case "rejected":
      return "Denied";
    default:
      return status;
  }
}

export function getBlockingRequestStatusForItemKey(
  itemKey: string,
  requests: Array<{ status: string; payload: unknown }>,
): string | null {
  for (const request of requests) {
    if (parseDailyPlanItemKeyFromPayload(request.payload) !== itemKey) {
      continue;
    }

    if (isBlockingCalendarRequestStatus(request.status)) {
      return request.status;
    }
  }

  return null;
}
