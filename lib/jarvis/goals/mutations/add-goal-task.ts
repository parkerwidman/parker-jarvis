import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTaskDueDateInput } from "../goal-dates";
import { parseGoalLevelId } from "./goal-task-mutation-shared";

export type AddGoalTaskResult =
  | {
      success: true;
      code: string;
      taskId: string;
      goalId: string;
      goalStatus: string;
    }
  | { success: false; error: string };

type AddGoalTaskRpcResult = {
  success: boolean;
  code?: string;
  task_id?: string;
  goal_id?: string;
  goal_status?: string;
};

const RPC_ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "You must be signed in to add a task.",
  invalid_level: "Invalid level.",
  invalid_title: "Task title must be between 1 and 200 characters.",
  level_not_found: "Level not found.",
  goal_not_found: "Goal not found.",
  goal_archived: "Archived goals cannot be updated.",
  goal_completed: "Completed goals are historical and cannot receive new tasks.",
  goal_not_active: "Only active goals can receive new tasks.",
};

function rpcErrorMessage(code: string | undefined): string {
  if (code && RPC_ERROR_MESSAGES[code]) {
    return RPC_ERROR_MESSAGES[code];
  }

  return "Could not add task. Try again.";
}

export async function addJarvisGoalTask(
  supabase: SupabaseClient,
  levelId: unknown,
  title: unknown,
  dueAt?: unknown,
): Promise<AddGoalTaskResult> {
  const parsedLevelId = parseGoalLevelId(levelId);

  if (!parsedLevelId) {
    return { success: false, error: "Invalid level." };
  }

  if (typeof title !== "string") {
    return { success: false, error: "Task title must be between 1 and 200 characters." };
  }

  const trimmedTitle = title.trim();

  if (trimmedTitle.length === 0 || trimmedTitle.length > 200) {
    return { success: false, error: "Task title must be between 1 and 200 characters." };
  }

  const parsedDueAt =
    dueAt === undefined || dueAt === null || dueAt === ""
      ? null
      : parseTaskDueDateInput(dueAt);

  if (dueAt !== undefined && dueAt !== null && dueAt !== "" && parsedDueAt === null) {
    return { success: false, error: "Due date must use YYYY-MM-DD format." };
  }

  const { data, error } = await supabase.rpc("add_jarvis_goal_task", {
    p_level_id: parsedLevelId,
    p_title: trimmedTitle,
    p_due_at: parsedDueAt,
  });

  if (error) {
    return { success: false, error: "Could not add task. Try again." };
  }

  const result = data as AddGoalTaskRpcResult | null;

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

export function mapAddGoalTaskError(code: string | undefined): string {
  return rpcErrorMessage(code);
}
