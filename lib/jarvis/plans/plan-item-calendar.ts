import type { PlanItem } from "./generate-daily-plan";
import { isValidSuggestedPlanItem } from "./generate-daily-plan";

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
