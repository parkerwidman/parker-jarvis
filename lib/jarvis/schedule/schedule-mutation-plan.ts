import { normalizeTimeForStorage } from "@/lib/jarvis/schedule/schedule-datetime";
import type {
  ScheduleBlockEditContext,
  ScheduleBlockFormValues,
  ScheduleCreateKind,
  ScheduleDeleteScope,
  ScheduleEditScope,
  ScheduleOneTimeCreateInput,
  ScheduleRecurringCreateInput,
} from "@/lib/jarvis/schedule/schedule-mutation-types";
import { hasOccurrenceDateChanged } from "@/lib/jarvis/schedule/schedule-validation";
import type { ScheduleMutationRpcPlan } from "@/lib/jarvis/schedule/pending-schedule-action-types";

function toTimeValue(localTime: string): string {
  return normalizeTimeForStorage(localTime).slice(0, 8);
}

function formToRpcTimes(form: Pick<ScheduleBlockFormValues, "startTime" | "endTime" | "isOpenEnded">): {
  startTime: string;
  endTime: string | null;
} {
  return {
    startTime: toTimeValue(form.startTime),
    endTime: form.isOpenEnded || !form.endTime ? null : toTimeValue(form.endTime),
  };
}

export function buildCreateScheduleMutationPlan(
  kind: ScheduleCreateKind,
  input: ScheduleRecurringCreateInput | ScheduleOneTimeCreateInput,
): ScheduleMutationRpcPlan {
  const times = formToRpcTimes(input);

  if (kind === "one_time") {
    return {
      rpc: "jarvis_schedule_upsert_one_off_override",
      args: {
        p_schedule_id: input.scheduleId,
        p_occurrence_date: input.occurrenceDate,
        p_title: input.title.trim(),
        p_category: input.category,
        p_start_time: times.startTime,
        p_end_time: times.endTime,
        p_notes: input.notes,
        p_override_id: null,
      },
    };
  }

  const recurring = input as ScheduleRecurringCreateInput;

  return {
    rpc: "jarvis_schedule_add_recurring_item",
    args: {
      p_schedule_id: recurring.scheduleId,
      p_day_of_week: recurring.dayOfWeek,
      p_effective_start_date: recurring.effectiveStartDate,
      p_title: recurring.title.trim(),
      p_category: recurring.category,
      p_start_time: times.startTime,
      p_end_time: times.endTime,
      p_notes: recurring.notes,
    },
  };
}

export function buildSaveScheduleMutationPlan(
  context: ScheduleBlockEditContext,
  form: ScheduleBlockFormValues,
  scope: ScheduleEditScope,
): ScheduleMutationRpcPlan | { error: string } {
  const times = formToRpcTimes(form);

  if (context.source === "added") {
    return {
      rpc: "jarvis_schedule_upsert_one_off_override",
      args: {
        p_schedule_id: context.scheduleId,
        p_occurrence_date: form.occurrenceDate,
        p_title: form.title.trim(),
        p_category: form.category,
        p_start_time: times.startTime,
        p_end_time: times.endTime,
        p_notes: form.notes,
        p_override_id: context.overrideId,
      },
    };
  }

  if (!context.scheduleItemId) {
    return { error: "Jarvis could not identify this schedule block." };
  }

  if (scope === "this_date_only") {
    if (hasOccurrenceDateChanged(context.occurrenceDate, form.occurrenceDate)) {
      return {
        rpc: "jarvis_schedule_move_occurrence",
        args: {
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
        },
      };
    }

    return {
      rpc: "jarvis_schedule_upsert_replace_override",
      args: {
        p_schedule_id: context.scheduleId,
        p_schedule_item_id: context.scheduleItemId,
        p_occurrence_date: form.occurrenceDate,
        p_title: form.title.trim(),
        p_category: form.category,
        p_start_time: times.startTime,
        p_end_time: times.endTime,
        p_notes: form.notes,
        p_override_id: context.overrideId,
      },
    };
  }

  if (scope === "this_and_future") {
    return {
      rpc: "jarvis_schedule_split_item_this_and_future",
      args: {
        p_schedule_id: context.scheduleId,
        p_schedule_item_id: context.scheduleItemId,
        p_split_date: context.occurrenceDate,
        p_title: form.title.trim(),
        p_category: form.category,
        p_day_of_week: form.dayOfWeek,
        p_start_time: times.startTime,
        p_end_time: times.endTime,
        p_notes: form.notes,
      },
    };
  }

  return {
    rpc: "jarvis_schedule_update_item_entire_series",
    args: {
      p_schedule_id: context.scheduleId,
      p_schedule_item_id: context.scheduleItemId,
      p_title: form.title.trim(),
      p_category: form.category,
      p_day_of_week: form.dayOfWeek,
      p_start_time: times.startTime,
      p_end_time: times.endTime,
      p_notes: form.notes,
    },
  };
}

export function buildDeleteScheduleMutationPlan(
  context: ScheduleBlockEditContext,
  scope: ScheduleDeleteScope,
): ScheduleMutationRpcPlan | { error: string } {
  if (context.source === "added") {
    if (!context.overrideId) {
      return { error: "Jarvis could not identify this one-time block." };
    }

    return {
      rpc: "jarvis_schedule_delete_one_off_override",
      args: {
        p_schedule_id: context.scheduleId,
        p_override_id: context.overrideId,
      },
    };
  }

  if (!context.scheduleItemId) {
    return { error: "Jarvis could not identify this schedule block." };
  }

  if (scope === "this_date_only") {
    return {
      rpc: "jarvis_schedule_skip_occurrence",
      args: {
        p_schedule_id: context.scheduleId,
        p_schedule_item_id: context.scheduleItemId,
        p_occurrence_date: context.occurrenceDate,
        p_override_id: context.overrideId,
      },
    };
  }

  if (scope === "this_and_future") {
    return {
      rpc: "jarvis_schedule_end_item_this_and_future",
      args: {
        p_schedule_id: context.scheduleId,
        p_schedule_item_id: context.scheduleItemId,
        p_split_date: context.occurrenceDate,
      },
    };
  }

  return {
    rpc: "jarvis_schedule_delete_item_entire_series",
    args: {
      p_schedule_id: context.scheduleId,
      p_schedule_item_id: context.scheduleItemId,
    },
  };
}

export async function executeScheduleMutationPlan(
  supabase: Parameters<
    typeof import("@/lib/jarvis/schedule/schedule-mutations").saveScheduleBlockEdit
  >[0],
  plan: ScheduleMutationRpcPlan,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc(plan.rpc, plan.args);

  if (error) {
    const message = error.message ?? "";

    if (message.includes("schedule_item_not_found")) {
      return { ok: false, error: "Jarvis could not find that schedule block." };
    }

    if (message.includes("schedule_not_found")) {
      return { ok: false, error: "Jarvis could not find that schedule block." };
    }

    return { ok: false, error: "Jarvis could not apply your schedule change." };
  }

  if (!data || typeof data !== "object" || !(data as { success?: boolean }).success) {
    const code =
      data && typeof data === "object"
        ? (data as { code?: string }).code
        : undefined;

    switch (code) {
      case "invalid_date":
        return { ok: false, error: "That date falls outside the selected schedule period." };
      case "invalid_occurrence":
        return {
          ok: false,
          error: "That schedule block is no longer valid for the proposed change.",
        };
      case "schedule_not_found":
      case "schedule_item_not_found":
        return { ok: false, error: "Jarvis could not find that schedule block." };
      default:
        return { ok: false, error: "Jarvis could not apply your schedule change." };
    }
  }

  return { ok: true };
}
