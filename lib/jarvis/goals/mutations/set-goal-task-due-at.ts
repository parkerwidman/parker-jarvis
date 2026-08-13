import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTaskDueDateInput } from "../goal-dates";
import {
  loadGoalTaskMutationContext,
  parseAuthenticatedUserId,
  parseGoalTaskId,
} from "./goal-task-mutation-shared";

export type SetGoalTaskDueAtResult =
  | { success: true; taskId: string; dueAt: string | null }
  | { success: false; error: string };

type SetGoalTaskDueAtRpcResult = {
  success: boolean;
  code?: string;
  task_id?: string;
  due_at?: string | null;
};

const RPC_ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "You must be signed in to update this task.",
  invalid_task: "Invalid task.",
  task_not_found: "Task not found.",
  not_goal_task: "This task is not part of a Jarvis goal.",
  goal_not_found: "Goal not found.",
  goal_archived: "Archived goals cannot be updated.",
};

function rpcErrorMessage(code: string | undefined): string {
  if (code && RPC_ERROR_MESSAGES[code]) {
    return RPC_ERROR_MESSAGES[code];
  }

  return "Could not update task due date. Try again.";
}

export async function setJarvisGoalTaskDueAt(
  supabase: SupabaseClient,
  userId: unknown,
  taskId: unknown,
  dueAt: unknown,
  clearDueAt = false,
): Promise<SetGoalTaskDueAtResult> {
  const parsedUserId = parseAuthenticatedUserId(userId);

  if (!parsedUserId) {
    return { success: false, error: RPC_ERROR_MESSAGES.unauthenticated };
  }

  const parsedTaskId = parseGoalTaskId(taskId);

  if (!parsedTaskId) {
    return { success: false, error: RPC_ERROR_MESSAGES.invalid_task };
  }

  const loaded = await loadGoalTaskMutationContext(supabase, parsedUserId, parsedTaskId);

  if (!("taskId" in loaded)) {
    return { success: false, error: loaded.error };
  }

  const parsedDueAt =
    clearDueAt || dueAt === null || dueAt === ""
      ? null
      : parseTaskDueDateInput(dueAt);

  if (!clearDueAt && dueAt !== null && dueAt !== undefined && dueAt !== "" && parsedDueAt === null) {
    return { success: false, error: "Due date must use YYYY-MM-DD format." };
  }

  const { data, error } = await supabase.rpc("set_jarvis_goal_task_due_at", {
    p_task_id: parsedTaskId,
    p_due_at: parsedDueAt,
    p_clear_due_at: clearDueAt,
  });

  if (error) {
    return { success: false, error: "Could not update task due date. Try again." };
  }

  const result = data as SetGoalTaskDueAtRpcResult | null;

  if (!result?.success || !result.task_id) {
    return { success: false, error: rpcErrorMessage(result?.code) };
  }

  return {
    success: true,
    taskId: result.task_id,
    dueAt: result.due_at ?? null,
  };
}
