import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseGoalTaskId, parseMoveDirection } from "./goal-task-mutation-shared";

export type MoveGoalTaskResult =
  | {
      success: true;
      code: string;
      taskId: string;
      goalId: string;
      levelId: string;
      direction: string;
      oldPosition: number;
      newPosition: number;
    }
  | { success: false; error: string };

type MoveGoalTaskRpcResult = {
  success: boolean;
  code?: string;
  task_id?: string;
  goal_id?: string;
  level_id?: string;
  direction?: string;
  old_position?: number;
  new_position?: number;
};

const RPC_ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "You must be signed in to reorder this task.",
  invalid_task: "Invalid task.",
  invalid_direction: "Invalid move direction.",
  task_not_found: "Task not found.",
  malformed_goal_task: "This goal task has an invalid attachment.",
  goal_not_found: "Goal not found.",
  goal_archived: "This archived goal can't be reordered.",
  goal_completed: "This completed goal can no longer be reordered.",
  goal_not_active: "Only active goals can be reordered.",
  malformed_goal_structure: "This goal has an invalid structure and cannot be updated.",
  task_busy: "This task is being updated. Try moving it again.",
  position_overflow: "This roadmap can't be reordered right now.",
};

function rpcErrorMessage(code: string | undefined): string {
  if (code && RPC_ERROR_MESSAGES[code]) {
    return RPC_ERROR_MESSAGES[code];
  }

  return "Could not move task. Try again.";
}

export async function moveJarvisGoalTask(
  supabase: SupabaseClient,
  taskId: unknown,
  direction: unknown,
): Promise<MoveGoalTaskResult> {
  const parsedTaskId = parseGoalTaskId(taskId);

  if (!parsedTaskId) {
    return { success: false, error: "Invalid task." };
  }

  const parsedDirection = parseMoveDirection(direction);

  if (!parsedDirection) {
    return { success: false, error: "Invalid move direction." };
  }

  const { data, error } = await supabase.rpc("move_jarvis_goal_task", {
    p_task_id: parsedTaskId,
    p_direction: parsedDirection,
  });

  if (error) {
    return { success: false, error: "Could not move task. Try again." };
  }

  const result = data as MoveGoalTaskRpcResult | null;

  if (!result?.success || !result.task_id || !result.goal_id || !result.code) {
    return { success: false, error: rpcErrorMessage(result?.code) };
  }

  return {
    success: true,
    code: result.code,
    taskId: result.task_id,
    goalId: result.goal_id,
    levelId: result.level_id ?? "",
    direction: result.direction ?? parsedDirection,
    oldPosition: result.old_position ?? 0,
    newPosition: result.new_position ?? 0,
  };
}

export function mapMoveGoalTaskError(code: string | undefined): string {
  return rpcErrorMessage(code);
}
