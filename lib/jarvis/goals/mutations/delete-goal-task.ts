import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseGoalTaskId } from "./goal-task-mutation-shared";

export type DeleteGoalTaskResult =
  | {
      success: true;
      code: string;
      taskId: string;
      goalId: string;
      goalStatus: string;
    }
  | { success: false; error: string };

type DeleteGoalTaskRpcResult = {
  success: boolean;
  code?: string;
  task_id?: string;
  goal_id?: string;
  goal_status?: string;
};

const RPC_ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "You must be signed in to delete this task.",
  invalid_task: "Invalid task.",
  task_not_found: "Task not found.",
  not_goal_task: "This task is not part of a Jarvis goal.",
  malformed_goal_task: "This goal task has an invalid attachment.",
  goal_not_found: "Goal not found.",
  goal_archived: "Archived goals cannot be updated.",
  goal_completed: "Completed goals are historical and tasks cannot be deleted.",
  goal_not_active: "Only active goals can have tasks deleted.",
  last_task_in_level: "Each level must keep at least one task.",
};

function rpcErrorMessage(code: string | undefined): string {
  if (code && RPC_ERROR_MESSAGES[code]) {
    return RPC_ERROR_MESSAGES[code];
  }

  return "Could not delete task. Try again.";
}

export async function deleteJarvisGoalTask(
  supabase: SupabaseClient,
  taskId: unknown,
): Promise<DeleteGoalTaskResult> {
  const parsedTaskId = parseGoalTaskId(taskId);

  if (!parsedTaskId) {
    return { success: false, error: "Invalid task." };
  }

  const { data, error } = await supabase.rpc("delete_jarvis_goal_task", {
    p_task_id: parsedTaskId,
  });

  if (error) {
    return { success: false, error: "Could not delete task. Try again." };
  }

  const result = data as DeleteGoalTaskRpcResult | null;

  if (!result?.success || !result.task_id || !result.goal_id || !result.code) {
    return { success: false, error: rpcErrorMessage(result?.code) };
  }

  return {
    success: true,
    code: result.code,
    taskId: result.task_id,
    goalId: result.goal_id,
    goalStatus: result.goal_status ?? "active",
  };
}

export function mapDeleteGoalTaskError(code: string | undefined): string {
  return rpcErrorMessage(code);
}
