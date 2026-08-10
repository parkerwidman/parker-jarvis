import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Goals-aware task completion via set_jarvis_goal_task_completion.
 * Generic surfaces dispatch goal-linked tasks here through task-tools.completeTask.
 */
export type SetGoalTaskCompletionResult =
  | {
      success: true;
      code: string;
      taskId: string;
      goalId: string;
      goalStatus: string;
      goalCompletedAt: string | null;
    }
  | { success: false; error: string };

type SetGoalTaskCompletionRpcResult = {
  success: boolean;
  code?: string;
  task_id?: string;
  goal_id?: string;
  goal_status?: string;
  goal_completed_at?: string | null;
};

const RPC_ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "You must be signed in to update this task.",
  task_not_found: "Task not found.",
  not_goal_task: "This task is not part of a Jarvis goal.",
  malformed_goal_task: "This goal task has an invalid attachment.",
  malformed_goal_structure:
    "This goal has inconsistent task attachments and cannot be updated safely.",
  invalid_completion_state: "Invalid completion state.",
  goal_not_found: "Goal not found.",
  goal_archived: "Archived goals cannot be updated.",
  level_locked: "Complete earlier roadmap levels before this task.",
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function rpcErrorMessage(code: string | undefined): string {
  if (code && RPC_ERROR_MESSAGES[code]) {
    return RPC_ERROR_MESSAGES[code];
  }

  return "Could not update task. Try again.";
}

export async function setJarvisGoalTaskCompletion(
  supabase: SupabaseClient,
  taskId: unknown,
  completed: unknown,
): Promise<SetGoalTaskCompletionResult> {
  if (typeof taskId !== "string") {
    return { success: false, error: "Invalid task." };
  }

  if (typeof completed !== "boolean") {
    return { success: false, error: "Invalid completion state." };
  }

  const normalizedTaskId = taskId.trim();

  if (!UUID_REGEX.test(normalizedTaskId)) {
    return { success: false, error: "Invalid task." };
  }

  const { data, error } = await supabase.rpc("set_jarvis_goal_task_completion", {
    p_task_id: normalizedTaskId,
    p_completed: completed,
  });

  if (error) {
    return { success: false, error: "Could not update task. Try again." };
  }

  const result = data as SetGoalTaskCompletionRpcResult | null;

  if (!result?.success || !result.task_id || !result.goal_id || !result.code) {
    return { success: false, error: rpcErrorMessage(result?.code) };
  }

  return {
    success: true,
    code: result.code,
    taskId: result.task_id,
    goalId: result.goal_id,
    goalStatus: result.goal_status ?? "active",
    goalCompletedAt: result.goal_completed_at ?? null,
  };
}

export function mapGoalTaskCompletionError(code: string | undefined): string {
  return rpcErrorMessage(code);
}
