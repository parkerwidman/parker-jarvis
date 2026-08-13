import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getActiveJarvisScheduleForDate } from "@/lib/jarvis/schedule/get-active-schedule-for-date";
import {
  PENDING_SCHEDULE_ACTION_VERSION,
  type PendingScheduleActionPayload,
  type ScheduleProposalCreateInput,
  type ScheduleProposalMoveInput,
  type ScheduleProposalRemoveInput,
  type ScheduleProposalScope,
  type ScheduleProposalUpdateInput,
} from "@/lib/jarvis/schedule/pending-schedule-action-types";
import {
  cancelPendingScheduleAction,
  confirmPendingScheduleAction,
  createPendingScheduleAction,
} from "@/lib/jarvis/schedule/pending-schedule-actions";
import {
  buildEditContextFromProposal,
  buildFormValuesFromProposal,
  buildMoveSummary,
  buildOneOffAddSummary,
  buildRecurringAddSummary,
  buildRemoveSummary,
  buildUpdateSummary,
} from "@/lib/jarvis/schedule/schedule-action-summaries";
import type {
  ScheduleBlockEditContext,
  ScheduleOneTimeCreateInput,
  ScheduleRecurringCreateInput,
} from "@/lib/jarvis/schedule/schedule-mutation-types";
import {
  buildCreateScheduleMutationPlan,
  buildDeleteScheduleMutationPlan,
  buildSaveScheduleMutationPlan,
} from "@/lib/jarvis/schedule/schedule-mutation-plan";
import { getScheduleBounds } from "@/lib/jarvis/schedule/schedule-mutations";
import {
  isValidLocalDate,
  isValidScheduleCategory,
  validateRecurringCreateInput,
  validateScheduleBlockForm,
} from "@/lib/jarvis/schedule/schedule-validation";
import type { PendingScheduleActionType } from "@/lib/jarvis/schedule/schedule-types";

function failure(error: string): Record<string, unknown> {
  return { success: false, error };
}

function mapScope(scope: ScheduleProposalScope) {
  return scope;
}

async function resolveScheduleForDate(
  supabase: SupabaseClient,
  userId: string,
  localDate: string,
) {
  if (!isValidLocalDate(localDate)) {
    return { success: false as const, error: "invalid_date" };
  }

  const schedule = await getActiveJarvisScheduleForDate(supabase, userId, localDate);

  if (!schedule) {
    return { success: false as const, error: "no_schedule_for_date" };
  }

  return { success: true as const, schedule };
}

function buildPayload(
  actionType: PendingScheduleActionType,
  scheduleId: string,
  execution: PendingScheduleActionPayload["execution"],
  mutation: PendingScheduleActionPayload["mutation"],
): PendingScheduleActionPayload {
  return {
    version: PENDING_SCHEDULE_ACTION_VERSION,
    actionType,
    scheduleId,
    execution,
    mutation,
  };
}

export async function proposeAddScheduleItem(
  supabase: SupabaseClient,
  userId: string,
  args: ScheduleProposalCreateInput,
): Promise<Record<string, unknown>> {
  if (!isValidScheduleCategory(args.category)) {
    return failure("invalid_category");
  }

  const scheduleResult = await resolveScheduleForDate(
    supabase,
    userId,
    args.kind === "recurring"
      ? args.effectiveStartDate ?? args.occurrenceDate
      : args.occurrenceDate,
  );

  if (!scheduleResult.success) {
    return failure(scheduleResult.error);
  }

  const schedule = scheduleResult.schedule;
  const bounds = getScheduleBounds(schedule);
  const isOpenEnded = args.isOpenEnded ?? false;
  const form = buildFormValuesFromProposal({
    title: args.title,
    category: args.category,
    occurrenceDate: args.occurrenceDate,
    dayOfWeek: args.dayOfWeek,
    startTime: args.startTime,
    endTime: args.endTime ?? null,
    isOpenEnded,
    notes: args.notes ?? null,
  });

  if (args.kind === "one_time") {
    const validationError = validateScheduleBlockForm(form, bounds);
    if (validationError) {
      return failure("invalid_proposal");
    }

    const input: ScheduleOneTimeCreateInput = {
      scheduleId: schedule.id,
      ...form,
    };
    const execution = buildCreateScheduleMutationPlan("one_time", input);
    const summary = buildOneOffAddSummary({
      title: form.title,
      occurrenceDate: form.occurrenceDate,
      startTime: form.startTime,
      endTime: form.endTime,
      isOpenEnded: form.isOpenEnded,
    });

    const created = await createPendingScheduleAction(supabase, userId, {
      actionType: "add",
      summary,
      payload: buildPayload("add", schedule.id, execution, {
        kind: "create_one_off",
        input,
      }),
    });

    return created.success
      ? { ...created, message: "Proposal created. Awaiting explicit confirmation." }
      : created;
  }

  const recurringInput: ScheduleRecurringCreateInput = {
    scheduleId: schedule.id,
    effectiveStartDate: args.effectiveStartDate ?? args.occurrenceDate,
    ...form,
  };
  const validationError = validateRecurringCreateInput(recurringInput, bounds);
  if (validationError) {
    return failure("invalid_proposal");
  }

  const execution = buildCreateScheduleMutationPlan("recurring", recurringInput);
  const summary = buildRecurringAddSummary({
    title: recurringInput.title,
    dayOfWeek: recurringInput.dayOfWeek,
    effectiveStartDate: recurringInput.effectiveStartDate,
    startTime: recurringInput.startTime,
    endTime: recurringInput.endTime,
    isOpenEnded: recurringInput.isOpenEnded,
  });

  const created = await createPendingScheduleAction(supabase, userId, {
    actionType: "add",
    summary,
    payload: buildPayload("add", schedule.id, execution, {
      kind: "create_recurring",
      input: recurringInput,
    }),
  });

  return created.success
    ? { ...created, message: "Proposal created. Awaiting explicit confirmation." }
    : created;
}

export async function proposeUpdateScheduleItem(
  supabase: SupabaseClient,
  userId: string,
  args: ScheduleProposalUpdateInput,
): Promise<Record<string, unknown>> {
  if (!isValidScheduleCategory(args.category)) {
    return failure("invalid_category");
  }

  const scheduleResult = await resolveScheduleForDate(
    supabase,
    userId,
    args.occurrenceDate,
  );

  if (!scheduleResult.success) {
    return failure(scheduleResult.error);
  }

  const schedule = scheduleResult.schedule;
  const bounds = getScheduleBounds(schedule);
  const context = buildEditContextFromProposal(args);
  const form = buildFormValuesFromProposal({
    title: args.title,
    category: args.category,
    occurrenceDate: args.targetOccurrenceDate ?? args.occurrenceDate,
    dayOfWeek: args.dayOfWeek,
    startTime: args.startTime,
    endTime: args.endTime ?? null,
    isOpenEnded: args.isOpenEnded ?? false,
    notes: args.notes ?? null,
  });
  const validationError = validateScheduleBlockForm(form, bounds);

  if (validationError) {
    return failure("invalid_proposal");
  }

  const scope = mapScope(args.scope);
  const plan = buildSaveScheduleMutationPlan(context, form, scope);

  if ("error" in plan) {
    return failure("invalid_proposal");
  }

  const summary = buildUpdateSummary({
    title: form.title,
    occurrenceDate: context.occurrenceDate,
    startTime: form.startTime,
    endTime: form.endTime,
    isOpenEnded: form.isOpenEnded,
    scope,
  });

  const created = await createPendingScheduleAction(supabase, userId, {
    actionType: "update",
    summary,
    payload: buildPayload("update", schedule.id, plan, {
      kind: "save_edit",
      context,
      form,
      scope,
    }),
  });

  return created.success
    ? { ...created, message: "Proposal created. Awaiting explicit confirmation." }
    : created;
}

export async function proposeMoveScheduleItem(
  supabase: SupabaseClient,
  userId: string,
  args: ScheduleProposalMoveInput,
): Promise<Record<string, unknown>> {
  if (!isValidScheduleCategory(args.category)) {
    return failure("invalid_category");
  }

  if (args.sourceDate === args.targetDate) {
    return failure("same_date");
  }

  const scheduleResult = await resolveScheduleForDate(
    supabase,
    userId,
    args.sourceDate,
  );

  if (!scheduleResult.success) {
    return failure(scheduleResult.error);
  }

  const schedule = scheduleResult.schedule;
  const bounds = getScheduleBounds(schedule);
  const context = buildEditContextFromProposal({
    scheduleId: schedule.id,
    scheduleItemId: args.scheduleItemId,
    overrideId: args.overrideId ?? null,
    source: args.source,
    occurrenceDate: args.sourceDate,
    title: args.title,
    category: args.category,
    startTime: args.startTime,
    endTime: args.endTime ?? null,
    isOpenEnded: args.isOpenEnded ?? false,
    notes: args.notes ?? null,
  });
  const form = buildFormValuesFromProposal({
    title: args.title,
    category: args.category,
    occurrenceDate: args.targetDate,
    startTime: args.startTime,
    endTime: args.endTime ?? null,
    isOpenEnded: args.isOpenEnded ?? false,
    notes: args.notes ?? null,
  });
  const validationError = validateScheduleBlockForm(form, bounds);

  if (validationError) {
    return failure("invalid_proposal");
  }

  const plan = buildSaveScheduleMutationPlan(context, form, "this_date_only");

  if ("error" in plan) {
    return failure("invalid_proposal");
  }

  const summary = buildMoveSummary({
    title: args.title,
    sourceDate: args.sourceDate,
    targetDate: args.targetDate,
    startTime: args.startTime,
    endTime: args.endTime ?? null,
    isOpenEnded: args.isOpenEnded ?? false,
  });

  const created = await createPendingScheduleAction(supabase, userId, {
    actionType: "move",
    summary,
    payload: buildPayload("move", schedule.id, plan, {
      kind: "save_edit",
      context,
      form,
      scope: "this_date_only",
    }),
  });

  return created.success
    ? { ...created, message: "Proposal created. Awaiting explicit confirmation." }
    : created;
}

async function proposeRemoveLikeAction(
  supabase: SupabaseClient,
  userId: string,
  args: ScheduleProposalRemoveInput,
  actionType: PendingScheduleActionType,
): Promise<Record<string, unknown>> {
  const scheduleResult = await resolveScheduleForDate(
    supabase,
    userId,
    args.occurrenceDate,
  );

  if (!scheduleResult.success) {
    return failure(scheduleResult.error);
  }

  const schedule = scheduleResult.schedule;
  const context: ScheduleBlockEditContext = buildEditContextFromProposal({
    scheduleId: schedule.id,
    scheduleItemId: args.scheduleItemId ?? null,
    overrideId: args.overrideId ?? null,
    source: args.source,
    occurrenceDate: args.occurrenceDate,
    title: args.title ?? "Schedule block",
    category: "other",
    startTime: "09:00",
    endTime: "10:00",
    isOpenEnded: false,
    notes: null,
  });
  const scope = mapScope(args.scope);
  const plan = buildDeleteScheduleMutationPlan(context, scope);

  if ("error" in plan) {
    return failure("invalid_proposal");
  }

  const summary = buildRemoveSummary({
    title: args.title ?? "Schedule block",
    occurrenceDate: args.occurrenceDate,
    scope,
  });

  const created = await createPendingScheduleAction(supabase, userId, {
    actionType,
    summary,
    payload: buildPayload(actionType, schedule.id, plan, {
      kind: "delete",
      context,
      scope,
    }),
  });

  return created.success
    ? { ...created, message: "Proposal created. Awaiting explicit confirmation." }
    : created;
}

export async function proposeRemoveScheduleItem(
  supabase: SupabaseClient,
  userId: string,
  args: ScheduleProposalRemoveInput,
): Promise<Record<string, unknown>> {
  return proposeRemoveLikeAction(supabase, userId, args, "remove");
}

export async function proposeSkipScheduleOccurrence(
  supabase: SupabaseClient,
  userId: string,
  args: ScheduleProposalRemoveInput,
): Promise<Record<string, unknown>> {
  return proposeRemoveLikeAction(supabase, userId, {
    ...args,
    scope: "this_date_only",
  }, "skip");
}

export async function confirmPendingScheduleActionTool(
  supabase: SupabaseClient,
  userId: string,
  args: { pendingActionId: unknown },
): Promise<Record<string, unknown>> {
  if (typeof args.pendingActionId !== "string" || args.pendingActionId.length < 1) {
    return failure("invalid_pending_action_id");
  }

  const result = await confirmPendingScheduleAction(
    supabase,
    userId,
    args.pendingActionId,
  );

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      errorCode: result.errorCode ?? "confirmation_failed",
    };
  }

  return {
    success: true,
    pendingActionId: result.pendingActionId,
    status: result.status,
    summary: result.summary,
    alreadyExecuted: result.alreadyExecuted === true,
    message:
      result.alreadyExecuted === true
        ? "That schedule change was already applied."
        : "Schedule change applied.",
  };
}

export async function cancelPendingScheduleActionTool(
  supabase: SupabaseClient,
  userId: string,
  args: { pendingActionId: unknown },
): Promise<Record<string, unknown>> {
  if (typeof args.pendingActionId !== "string" || args.pendingActionId.length < 1) {
    return failure("invalid_pending_action_id");
  }

  const result = await cancelPendingScheduleAction(
    supabase,
    userId,
    args.pendingActionId,
  );

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    pendingActionId: result.pendingActionId,
    status: result.status,
    message: "Pending schedule change cancelled.",
  };
}
