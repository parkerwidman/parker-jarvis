import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT,
  ACTION_TYPE_CREATE_TASK,
  APPROVAL_REQUIRED_RISK_LEVEL,
} from "@/lib/jarvis/action-requests/action-type-constants";
import { findDuplicatePendingActionRequest, computeActionRequestExpiration } from "@/lib/jarvis/action-requests/action-request-dedup";
import {
  buildCalendarProposalSummary,
  buildTaskProposalSummary,
} from "@/lib/jarvis/action-requests/action-executor-registry";
import {
  normalizeCalendarPayloadForDedup,
  validateCalendarEventPayload,
} from "@/lib/jarvis/action-requests/calendar-action-payload";
import {
  normalizeTaskPayloadForDedup,
  validateTaskProposalInput,
} from "@/lib/jarvis/action-requests/task-action-payload";

const ACTION_REQUEST_SELECT =
  "id, action_type, status, risk_level, title, summary, expires_at, created_at, result, safe_error_message";

const VALID_STATUSES = new Set([
  "pending",
  "approved",
  "executing",
  "completed",
  "rejected",
  "failed",
  "expired",
]);

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

export type ProposeTaskResult =
  | {
      success: true;
      status: "pending";
      approvalRequired: true;
      title: string;
      summary: string;
      expiresAt: string;
      message: string;
    }
  | { success: false; error: string };

export type ListActionRequestsResult =
  | { success: true; actionRequests: ActionRequestRecord[] }
  | { success: false; error: string };

export type DailyPlanCalendarSource = {
  dailyPlanId: string;
  dailyPlanItemKey: string;
  reason: string;
};

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
    dailyPlanSource?: DailyPlanCalendarSource;
  },
): Promise<ProposeOutlookCalendarEventResult> {
  const validated = validateCalendarEventPayload({
    subject: input.subject,
    startDateTime: input.startDateTime,
    endDateTime: input.endDateTime,
    timeZone: input.timeZone,
    locationName: input.locationName,
    notes: input.notes,
  });

  if (!validated.success) {
    return { success: false, error: "Invalid calendar event proposal." };
  }

  const payload = { ...validated.payload };
  let title = "Create Outlook calendar event";
  let requestSummary = buildCalendarProposalSummary(validated.payload);

  if (input.dailyPlanSource) {
    payload.dailyPlanId = input.dailyPlanSource.dailyPlanId;
    payload.dailyPlanItemKey = input.dailyPlanSource.dailyPlanItemKey;
    payload.source = "daily_plan";
    payload.reason = input.dailyPlanSource.reason;
    title = "Schedule Daily Plan block on Outlook";
    requestSummary = `From Daily Plan — ${requestSummary}`;
  }

  const dedupPayload = normalizeCalendarPayloadForDedup(validated.payload);
  const duplicate = await findDuplicatePendingActionRequest(
    supabase,
    userId,
    ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT,
    dedupPayload,
  );

  if (duplicate) {
    return {
      success: true,
      actionRequestId: "existing",
      status: duplicate.status,
      title: duplicate.title,
      summary: duplicate.summary,
      expiresAt: duplicate.expires_at,
    };
  }

  const expiresAt = computeActionRequestExpiration();

  const { data, error } = await supabase
    .from("action_requests")
    .insert({
      user_id: userId,
      action_type: ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT,
      status: "pending",
      risk_level: APPROVAL_REQUIRED_RISK_LEVEL,
      title,
      summary: requestSummary,
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

export async function proposeTask(
  supabase: SupabaseClient,
  userId: string,
  input: {
    title: string;
    description?: string | null;
    priority?: string | null;
    dueDate?: string | null;
    context?: string | null;
  },
): Promise<ProposeTaskResult> {
  const validated = validateTaskProposalInput(input);

  if (!validated.success) {
    return { success: false, error: "Invalid task proposal." };
  }

  const payload = validated.payload;
  const dedupPayload = normalizeTaskPayloadForDedup(payload);
  const duplicate = await findDuplicatePendingActionRequest(
    supabase,
    userId,
    ACTION_TYPE_CREATE_TASK,
    dedupPayload,
  );

  if (duplicate) {
    return {
      success: true,
      status: "pending",
      approvalRequired: true,
      title: duplicate.title,
      summary: duplicate.summary,
      expiresAt: duplicate.expires_at,
      message: "A matching task proposal is already waiting for approval.",
    };
  }

  const title = "Create task";
  const requestSummary = buildTaskProposalSummary(payload);
  const expiresAt = computeActionRequestExpiration();

  const { data, error } = await supabase
    .from("action_requests")
    .insert({
      user_id: userId,
      action_type: ACTION_TYPE_CREATE_TASK,
      status: "pending",
      risk_level: APPROVAL_REQUIRED_RISK_LEVEL,
      title,
      summary: requestSummary,
      payload,
      expires_at: expiresAt,
    })
    .select("status, title, summary, expires_at")
    .single();

  if (error || !data) {
    return { success: false, error: "Could not create approval request." };
  }

  return {
    success: true,
    status: "pending",
    approvalRequired: true,
    title: data.title,
    summary: data.summary,
    expiresAt: data.expires_at,
    message: "Task proposal submitted for approval.",
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
