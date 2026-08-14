import type { PendingScheduleActionRecord } from "@/lib/jarvis/schedule/pending-schedule-action-types";
import type { ScheduleConfirmationIntent } from "@/lib/jarvis/schedule/schedule-confirmation-intent";

export type PendingSchedulePresentation = "full" | "compact" | "none";

const SCHEDULE_REFERENCE_PATTERNS = [
  /\bschedule\b/,
  /\bpending\b/,
  /\bproposal\b/,
  /\bthat change\b/,
  /\bthat block\b/,
  /\bworkout\b/,
  /\bmove it\b/,
  /\bdo that\b/,
  /\bgo ahead\b/,
];

function normalizeMessage(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isScheduleRelatedFollowUp(message: string): boolean {
  const normalized = normalizeMessage(message);

  return SCHEDULE_REFERENCE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function resolvePendingSchedulePresentation(input: {
  pendingAction: PendingScheduleActionRecord | null;
  confirmationIntent: ScheduleConfirmationIntent;
  currentMessage: string;
}): PendingSchedulePresentation {
  if (!input.pendingAction) {
    return "none";
  }

  if (input.confirmationIntent !== "unknown") {
    return "full";
  }

  if (isScheduleRelatedFollowUp(input.currentMessage)) {
    return "full";
  }

  return "compact";
}

export function buildCompactPendingScheduleMarker(
  pendingAction: PendingScheduleActionRecord,
): string {
  return `\n\nPending Schedule action stored (ID: ${pendingAction.id}). It is not active for this turn unless Parker confirms, cancels, or revises that exact proposal.`;
}
