import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT,
  ACTION_TYPE_CREATE_TASK,
  APPROVAL_REQUIRED_RISK_LEVEL,
} from "./action-type-constants";
import type {
  ActionExecutionContext,
  ActionExecutionOutcome,
  ActionPreview,
  RegisteredActionExecutor,
  SafeActionResult,
} from "./action-executor-types";
import {
  buildCalendarEventSummary,
  normalizeCalendarPayloadForDedup,
  validateCalendarEventPayload,
  type ValidatedCalendarEventPayload,
} from "./calendar-action-payload";
import {
  buildTaskSummary,
  normalizeTaskPayloadForDedup,
  validateTaskPayload,
  type ValidatedTaskPayload,
} from "./task-action-payload";
import { createOutlookCalendarEvent } from "@/lib/jarvis/tools/microsoft-tools";
import { createTask } from "@/lib/jarvis/tools/task-tools";

const GENERIC_CALENDAR_EXECUTION_ERROR =
  "The calendar event could not be created. Please try again or reconnect Microsoft 365.";

const GENERIC_TASK_EXECUTION_ERROR =
  "The task could not be created. Please try again.";

const calendarExecutor: RegisteredActionExecutor<ValidatedCalendarEventPayload> =
  {
    actionType: ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT,
    riskLevel: APPROVAL_REQUIRED_RISK_LEVEL,
    validatePayload: validateCalendarEventPayload,
    normalizePayloadForDedup: normalizeCalendarPayloadForDedup,
    buildPreview(payload) {
      const preview: ActionPreview = {
        actionLabel: "Create Outlook calendar event",
        fields: [
          { label: "Subject", value: payload.subject },
          {
            label: "Start",
            value: payload.startDateTime,
          },
          {
            label: "End",
            value: payload.endDateTime,
          },
          { label: "Timezone", value: payload.timeZone },
        ],
      };

      if (payload.locationName) {
        preview.fields.push({
          label: "Location",
          value: payload.locationName,
        });
      }

      if (payload.notes) {
        preview.fields.push({ label: "Notes", value: payload.notes });
      }

      if (payload.source === "daily_plan") {
        preview.sourceLabel = "From Daily Plan";
      }

      if (payload.reason) {
        preview.reason = payload.reason;
      }

      return preview;
    },
    async execute(payload, context) {
      const supabase = getSupabaseFromContext(context);

      const result = await createOutlookCalendarEvent(supabase, context.userId, {
        actionRequestId: context.actionRequestId,
        subject: payload.subject,
        startDateTime: payload.startDateTime,
        endDateTime: payload.endDateTime,
        locationName: payload.locationName,
        notes: payload.notes,
      });

      if (!result.success) {
        return { success: false, errorCode: "approval_execution_failed" };
      }

      return {
        success: true,
        data: {
          eventId: result.eventId,
          subject: result.subject,
          start: result.start,
          end: result.end,
          webLink: result.webLink,
        },
      };
    },
    mapSafeResult(payload, executionData) {
      return {
        success: true,
        actionType: ACTION_TYPE_CREATE_OUTLOOK_CALENDAR_EVENT,
        status: "completed",
        subject:
          typeof executionData.subject === "string"
            ? executionData.subject
            : payload.subject,
        start:
          typeof executionData.start === "string" ? executionData.start : null,
        end: typeof executionData.end === "string" ? executionData.end : null,
        webLink:
          typeof executionData.webLink === "string" ||
          executionData.webLink === null
            ? executionData.webLink
            : null,
      };
    },
    genericExecutionError: GENERIC_CALENDAR_EXECUTION_ERROR,
  };

const taskExecutor: RegisteredActionExecutor<ValidatedTaskPayload> = {
  actionType: ACTION_TYPE_CREATE_TASK,
  riskLevel: APPROVAL_REQUIRED_RISK_LEVEL,
  validatePayload: validateTaskPayload,
  normalizePayloadForDedup: normalizeTaskPayloadForDedup,
  buildPreview(payload) {
    const preview: ActionPreview = {
      actionLabel: "Create task",
      fields: [{ label: "Title", value: payload.title }],
    };

    if (payload.description) {
      preview.fields.push({
        label: "Description",
        value: payload.description,
      });
    }

    preview.fields.push({ label: "Priority", value: payload.priority });

    if (payload.dueDate) {
      preview.fields.push({ label: "Due date", value: payload.dueDate });
    }

    if (payload.context) {
      preview.fields.push({ label: "Context", value: payload.context });
    }

    return preview;
  },
  async execute(payload, context) {
    const supabase = getSupabaseFromContext(context);

    const result = await createTask(supabase, context.userId, {
      title: payload.title,
      priority: payload.priority,
      dueDate: payload.dueDate ?? undefined,
      notes: buildTaskNotesFromPayload(payload),
    });

    if (!result.success) {
      return { success: false, errorCode: "approval_execution_failed" };
    }

    return {
      success: true,
      data: {
        title: payload.title,
        dueDate: payload.dueDate,
      },
    };
  },
  mapSafeResult(payload) {
    return {
      success: true,
      actionType: ACTION_TYPE_CREATE_TASK,
      status: "completed",
      title: payload.title,
      dueDate: payload.dueDate,
    };
  },
  genericExecutionError: GENERIC_TASK_EXECUTION_ERROR,
};

function buildTaskNotesFromPayload(payload: ValidatedTaskPayload): string | undefined {
  const parts: string[] = [];

  if (payload.description) {
    parts.push(payload.description);
  }

  if (payload.context) {
    parts.push(`Context: ${payload.context}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

const EXECUTOR_REGISTRY = new Map<string, RegisteredActionExecutor<unknown>>([
  [calendarExecutor.actionType, calendarExecutor as RegisteredActionExecutor<unknown>],
  [taskExecutor.actionType, taskExecutor as RegisteredActionExecutor<unknown>],
]);

const supabaseContextStore = new WeakMap<
  ActionExecutionContext,
  SupabaseClient
>();

export function bindSupabaseToExecutionContext(
  context: ActionExecutionContext,
  supabase: SupabaseClient,
): ActionExecutionContext {
  supabaseContextStore.set(context, supabase);
  return context;
}

function getSupabaseFromContext(context: ActionExecutionContext): SupabaseClient {
  const supabase = supabaseContextStore.get(context);

  if (!supabase) {
    throw new Error("action_unavailable");
  }

  return supabase;
}

export function getRegisteredExecutor(
  actionType: string,
): RegisteredActionExecutor<unknown> | null {
  return EXECUTOR_REGISTRY.get(actionType) ?? null;
}

export function isFinanceOrPlaidWriteAction(actionType: string): boolean {
  const blockedPatterns = [
    "finance",
    "plaid",
    "transfer",
    "payment",
    "dispute",
    "classification",
  ];

  const normalized = actionType.toLowerCase();
  return blockedPatterns.some((pattern) => normalized.includes(pattern));
}

export function validateRegisteredPayload(
  actionType: string,
  payload: unknown,
):
  | { success: true; payload: unknown }
  | { success: false; errorCode: "invalid_action_payload" | "action_unavailable" } {
  const executor = getRegisteredExecutor(actionType);

  if (!executor) {
    return { success: false, errorCode: "action_unavailable" };
  }

  return executor.validatePayload(payload);
}

export function buildRegisteredActionPreview(
  actionType: string,
  payload: unknown,
): ActionPreview | null {
  const executor = getRegisteredExecutor(actionType);

  if (!executor) {
    return null;
  }

  const validated = executor.validatePayload(payload);

  if (!validated.success) {
    return null;
  }

  return executor.buildPreview(validated.payload);
}

export function normalizeRegisteredPayloadForDedup(
  actionType: string,
  payload: unknown,
): Record<string, unknown> | null {
  const executor = getRegisteredExecutor(actionType);

  if (!executor) {
    return null;
  }

  const validated = executor.validatePayload(payload);

  if (!validated.success) {
    return null;
  }

  return executor.normalizePayloadForDedup(validated.payload);
}

export async function executeRegisteredAction(
  actionType: string,
  payload: unknown,
  context: ActionExecutionContext,
): Promise<
  | {
      success: true;
      safeResult: SafeActionResult;
      genericExecutionError: null;
    }
  | {
      success: false;
      errorCode:
        | "invalid_action_payload"
        | "approval_execution_failed"
        | "action_unavailable";
      genericExecutionError: string;
    }
> {
  const executor = getRegisteredExecutor(actionType);

  if (!executor) {
    return {
      success: false,
      errorCode: "action_unavailable",
      genericExecutionError: "This action is not available.",
    };
  }

  const validated = executor.validatePayload(payload);

  if (!validated.success) {
    return {
      success: false,
      errorCode: "invalid_action_payload",
      genericExecutionError: executor.genericExecutionError,
    };
  }

  const outcome = await executor.execute(validated.payload, context);

  if (!outcome.success) {
    return {
      success: false,
      errorCode: outcome.errorCode,
      genericExecutionError: executor.genericExecutionError,
    };
  }

  return {
    success: true,
    safeResult: executor.mapSafeResult(validated.payload, outcome.data),
    genericExecutionError: null,
  };
}

export function buildCalendarProposalSummary(
  payload: ValidatedCalendarEventPayload,
): string {
  return buildCalendarEventSummary(payload);
}

export function buildTaskProposalSummary(payload: ValidatedTaskPayload): string {
  return buildTaskSummary(payload);
}

export { calendarExecutor, taskExecutor };
