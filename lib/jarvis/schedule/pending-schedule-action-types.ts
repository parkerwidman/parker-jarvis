import type {
  ScheduleBlockEditContext,
  ScheduleBlockFormValues,
  ScheduleCreateKind,
  ScheduleDeleteScope,
  ScheduleEditScope,
  ScheduleOneTimeCreateInput,
  ScheduleRecurringCreateInput,
} from "@/lib/jarvis/schedule/schedule-mutation-types";
import type {
  PendingScheduleActionStatus,
  PendingScheduleActionType,
} from "@/lib/jarvis/schedule/schedule-types";

export const PENDING_SCHEDULE_ACTION_VERSION = 1 as const;
export const PENDING_SCHEDULE_ACTION_TTL_MINUTES = 30;

export type ScheduleMutationRpcPlan = {
  rpc: string;
  args: Record<string, unknown>;
};

export type PendingScheduleActionPayload = {
  version: typeof PENDING_SCHEDULE_ACTION_VERSION;
  actionType: PendingScheduleActionType;
  execution: ScheduleMutationRpcPlan;
  scheduleId: string;
  mutation:
    | { kind: "create_one_off"; input: ScheduleOneTimeCreateInput }
    | { kind: "create_recurring"; input: ScheduleRecurringCreateInput }
    | {
        kind: "save_edit";
        context: ScheduleBlockEditContext;
        form: ScheduleBlockFormValues;
        scope: ScheduleEditScope;
      }
    | {
        kind: "delete";
        context: ScheduleBlockEditContext;
        scope: ScheduleDeleteScope;
      };
};

export type PendingScheduleActionRecord = {
  id: string;
  userId: string;
  actionType: PendingScheduleActionType;
  status: PendingScheduleActionStatus;
  summary: string;
  payload: PendingScheduleActionPayload;
  agentKey: "main" | "melusi";
  threadId: string | null;
  expiresAt: string;
  confirmedAt: string | null;
  executedAt: string | null;
  result: Record<string, unknown> | null;
  safeErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PendingScheduleProposalResult =
  | {
      success: true;
      pendingActionId: string;
      actionType: PendingScheduleActionType;
      summary: string;
      expiresAt: string;
      requiresConfirmation: true;
    }
  | { success: false; error: string };

export type PendingScheduleConfirmResult =
  | {
      success: true;
      pendingActionId: string;
      status: "executed";
      summary: string;
      alreadyExecuted?: false;
    }
  | {
      success: true;
      pendingActionId: string;
      status: "executed";
      summary: string;
      alreadyExecuted: true;
    }
  | { success: false; error: string; errorCode?: string };

export type PendingScheduleCancelResult =
  | { success: true; pendingActionId: string; status: "cancelled" }
  | { success: false; error: string };

export type ScheduleProposalScope =
  | "this_date_only"
  | "this_and_future"
  | "entire_series";

export type ScheduleProposalCreateInput = {
  kind: ScheduleCreateKind;
  scheduleId: string;
  title: string;
  category: string;
  occurrenceDate: string;
  dayOfWeek?: number;
  effectiveStartDate?: string;
  startTime: string;
  endTime?: string | null;
  isOpenEnded?: boolean;
  notes?: string | null;
};

export type ScheduleProposalUpdateInput = {
  scheduleId: string;
  scheduleItemId?: string | null;
  overrideId?: string | null;
  occurrenceKey?: string;
  source?: string;
  occurrenceDate: string;
  scope: ScheduleProposalScope;
  title: string;
  category: string;
  dayOfWeek?: number;
  startTime: string;
  endTime?: string | null;
  isOpenEnded?: boolean;
  notes?: string | null;
  targetOccurrenceDate?: string;
};

export type ScheduleProposalMoveInput = {
  scheduleId: string;
  scheduleItemId: string;
  overrideId?: string | null;
  source?: string;
  sourceDate: string;
  targetDate: string;
  scope: "this_date_only";
  title: string;
  category: string;
  startTime: string;
  endTime?: string | null;
  isOpenEnded?: boolean;
  notes?: string | null;
};

export type ScheduleProposalRemoveInput = {
  scheduleId: string;
  scheduleItemId?: string | null;
  overrideId?: string | null;
  source?: string;
  occurrenceDate: string;
  scope: ScheduleProposalScope;
  title?: string;
};
