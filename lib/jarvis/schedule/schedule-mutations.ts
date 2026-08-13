import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeTimeForStorage } from "@/lib/jarvis/schedule/schedule-datetime";
import type {
  ScheduleBlockEditContext,
  ScheduleBlockFormValues,
  ScheduleCreateKind,
  ScheduleDeleteScope,
  ScheduleEditScope,
  ScheduleMutationResult,
  ScheduleOneTimeCreateInput,
  ScheduleRecurringCreateInput,
} from "@/lib/jarvis/schedule/schedule-mutation-types";
import {
  hasOccurrenceDateChanged,
} from "@/lib/jarvis/schedule/schedule-validation";
import type { JarvisSchedule } from "@/lib/jarvis/schedule/schedule-types";

type RpcResult = {
  success?: boolean;
  code?: string;
  error?: string;
};

function mapRpcError(code: string | undefined): string {
  switch (code) {
    case "unauthenticated":
      return "You must be signed in to update your schedule.";
    case "invalid_date":
      return "That date falls outside the selected schedule period.";
    case "invalid_title":
      return "Title is required.";
    case "invalid_occurrence":
      return "That date is not a valid occurrence for this recurring block.";
    case "invalid_time_range":
      return "End time must be after start time.";
    case "same_date":
      return "Choose a different date to move this block.";
    case "invalid_split_date":
      return "This change cannot start on the selected date.";
    case "schedule_not_found":
    case "schedule_item_not_found":
      return "Jarvis could not find that schedule block.";
    default:
      return "Jarvis could not save your schedule change.";
  }
}

function parseRpcResult(data: unknown): RpcResult {
  if (!data || typeof data !== "object") {
    return { success: false, code: "unknown" };
  }

  return data as RpcResult;
}

function toTimeValue(localTime: string): string {
  return normalizeTimeForStorage(localTime).slice(0, 8);
}

function formToRpcTimes(form: ScheduleBlockFormValues): {
  startTime: string;
  endTime: string | null;
} {
  return {
    startTime: toTimeValue(form.startTime),
    endTime: form.isOpenEnded || !form.endTime ? null : toTimeValue(form.endTime),
  };
}

async function callRpc(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<ScheduleMutationResult> {
  const { data, error } = await supabase.rpc(fn, args);

  if (error) {
    const message = error.message ?? "";

    if (message.includes("schedule_item_not_found")) {
      return { ok: false, error: mapRpcError("schedule_item_not_found") };
    }

    if (message.includes("schedule_not_found")) {
      return { ok: false, error: mapRpcError("schedule_not_found") };
    }

    return { ok: false, error: mapRpcError(undefined) };
  }

  const result = parseRpcResult(data);

  if (!result.success) {
    return { ok: false, error: mapRpcError(result.code) };
  }

  return { ok: true };
}

export async function saveScheduleBlockEdit(
  supabase: SupabaseClient,
  context: ScheduleBlockEditContext,
  form: ScheduleBlockFormValues,
  scope: ScheduleEditScope,
): Promise<ScheduleMutationResult> {
  const times = formToRpcTimes(form);

  if (context.source === "added") {
    return callRpc(supabase, "jarvis_schedule_upsert_one_off_override", {
      p_schedule_id: context.scheduleId,
      p_occurrence_date: form.occurrenceDate,
      p_title: form.title.trim(),
      p_category: form.category,
      p_start_time: times.startTime,
      p_end_time: times.endTime,
      p_notes: form.notes,
      p_override_id: context.overrideId,
    });
  }

  if (!context.scheduleItemId) {
    return { ok: false, error: "Jarvis could not identify this schedule block." };
  }

  if (scope === "this_date_only") {
    if (
      hasOccurrenceDateChanged(context.occurrenceDate, form.occurrenceDate)
    ) {
      return callRpc(supabase, "jarvis_schedule_move_occurrence", {
        p_schedule_id: context.scheduleId,
        p_schedule_item_id: context.scheduleItemId,
        p_source_date: context.occurrenceDate,
        p_target_date: form.occurrenceDate,
        p_title: form.title.trim(),
        p_category: form.category,
        p_start_time: times.startTime,
        p_end_time: times.endTime,
        p_notes: form.notes,
        p_source_override_id: context.overrideId,
      });
    }

    return callRpc(supabase, "jarvis_schedule_upsert_replace_override", {
      p_schedule_id: context.scheduleId,
      p_schedule_item_id: context.scheduleItemId,
      p_occurrence_date: form.occurrenceDate,
      p_title: form.title.trim(),
      p_category: form.category,
      p_start_time: times.startTime,
      p_end_time: times.endTime,
      p_notes: form.notes,
      p_override_id: context.overrideId,
    });
  }

  if (scope === "this_and_future") {
    return callRpc(supabase, "jarvis_schedule_split_item_this_and_future", {
      p_schedule_id: context.scheduleId,
      p_schedule_item_id: context.scheduleItemId,
      p_split_date: context.occurrenceDate,
      p_title: form.title.trim(),
      p_category: form.category,
      p_day_of_week: form.dayOfWeek,
      p_start_time: times.startTime,
      p_end_time: times.endTime,
      p_notes: form.notes,
    });
  }

  return callRpc(supabase, "jarvis_schedule_update_item_entire_series", {
    p_schedule_id: context.scheduleId,
    p_schedule_item_id: context.scheduleItemId,
    p_title: form.title.trim(),
    p_category: form.category,
    p_day_of_week: form.dayOfWeek,
    p_start_time: times.startTime,
    p_end_time: times.endTime,
    p_notes: form.notes,
  });
}

export async function deleteScheduleBlock(
  supabase: SupabaseClient,
  context: ScheduleBlockEditContext,
  scope: ScheduleDeleteScope,
): Promise<ScheduleMutationResult> {
  if (context.source === "added") {
    if (!context.overrideId) {
      return { ok: false, error: "Jarvis could not identify this one-time block." };
    }

    return callRpc(supabase, "jarvis_schedule_delete_one_off_override", {
      p_schedule_id: context.scheduleId,
      p_override_id: context.overrideId,
    });
  }

  if (!context.scheduleItemId) {
    return { ok: false, error: "Jarvis could not identify this schedule block." };
  }

  if (scope === "this_date_only") {
    return callRpc(supabase, "jarvis_schedule_skip_occurrence", {
      p_schedule_id: context.scheduleId,
      p_schedule_item_id: context.scheduleItemId,
      p_occurrence_date: context.occurrenceDate,
      p_override_id: context.overrideId,
    });
  }

  if (scope === "this_and_future") {
    return callRpc(supabase, "jarvis_schedule_end_item_this_and_future", {
      p_schedule_id: context.scheduleId,
      p_schedule_item_id: context.scheduleItemId,
      p_split_date: context.occurrenceDate,
    });
  }

  return callRpc(supabase, "jarvis_schedule_delete_item_entire_series", {
    p_schedule_id: context.scheduleId,
    p_schedule_item_id: context.scheduleItemId,
  });
}

export async function createScheduleBlock(
  supabase: SupabaseClient,
  kind: ScheduleCreateKind,
  input: ScheduleRecurringCreateInput | ScheduleOneTimeCreateInput,
): Promise<ScheduleMutationResult> {
  const times = formToRpcTimes(input);

  if (kind === "one_time") {
    return callRpc(supabase, "jarvis_schedule_upsert_one_off_override", {
      p_schedule_id: input.scheduleId,
      p_occurrence_date: input.occurrenceDate,
      p_title: input.title.trim(),
      p_category: input.category,
      p_start_time: times.startTime,
      p_end_time: times.endTime,
      p_notes: input.notes,
      p_override_id: null,
    });
  }

  const recurring = input as ScheduleRecurringCreateInput;

  return callRpc(supabase, "jarvis_schedule_add_recurring_item", {
    p_schedule_id: recurring.scheduleId,
    p_day_of_week: recurring.dayOfWeek,
    p_effective_start_date: recurring.effectiveStartDate,
    p_title: recurring.title.trim(),
    p_category: recurring.category,
    p_start_time: times.startTime,
    p_end_time: times.endTime,
    p_notes: recurring.notes,
  });
}

export function getScheduleBounds(
  schedule: JarvisSchedule,
): { startDate: string; endDate: string } {
  return {
    startDate: schedule.startDate,
    endDate: schedule.endDate,
  };
}
