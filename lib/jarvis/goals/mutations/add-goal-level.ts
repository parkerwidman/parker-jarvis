import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GOAL_LEVEL_NAME_MAX_LENGTH,
  GOAL_TASK_TITLE_MAX_LENGTH,
  parseGoalId,
} from "./goal-task-mutation-shared";

export type AddGoalLevelResult =
  | {
      success: true;
      code: string;
      levelId: string;
      taskId: string;
      goalId: string;
      goalStatus: string;
    }
  | { success: false; error: string };

type AddGoalLevelRpcResult = {
  success: boolean;
  code?: string;
  level_id?: string;
  task_id?: string;
  goal_id?: string;
  goal_status?: string;
};

const RPC_ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "You must be signed in to add a level.",
  invalid_goal: "Invalid goal.",
  invalid_level_name: "Level name must be between 1 and 200 characters.",
  invalid_task_title: "Task title must be between 1 and 200 characters.",
  goal_not_found: "Goal not found.",
  goal_archived: "Archived goals cannot be updated.",
  goal_completed: "Completed goals are historical and cannot receive new levels.",
  goal_not_active: "Only active goals can receive new levels.",
  malformed_goal_structure: "This goal has an invalid structure and cannot be updated.",
};

function rpcErrorMessage(code: string | undefined): string {
  if (code && RPC_ERROR_MESSAGES[code]) {
    return RPC_ERROR_MESSAGES[code];
  }

  return "Could not add level. Try again.";
}

export async function addJarvisGoalLevel(
  supabase: SupabaseClient,
  goalId: unknown,
  levelName: unknown,
  firstTaskTitle: unknown,
): Promise<AddGoalLevelResult> {
  const parsedGoalId = parseGoalId(goalId);

  if (!parsedGoalId) {
    return { success: false, error: "Invalid goal." };
  }

  if (typeof levelName !== "string") {
    return { success: false, error: "Level name must be between 1 and 200 characters." };
  }

  const trimmedLevelName = levelName.trim();

  if (
    trimmedLevelName.length === 0 ||
    trimmedLevelName.length > GOAL_LEVEL_NAME_MAX_LENGTH
  ) {
    return { success: false, error: "Level name must be between 1 and 200 characters." };
  }

  if (typeof firstTaskTitle !== "string") {
    return { success: false, error: "Task title must be between 1 and 200 characters." };
  }

  const trimmedTaskTitle = firstTaskTitle.trim();

  if (
    trimmedTaskTitle.length === 0 ||
    trimmedTaskTitle.length > GOAL_TASK_TITLE_MAX_LENGTH
  ) {
    return { success: false, error: "Task title must be between 1 and 200 characters." };
  }

  const { data, error } = await supabase.rpc("add_jarvis_goal_level", {
    p_goal_id: parsedGoalId,
    p_level_name: trimmedLevelName,
    p_first_task_title: trimmedTaskTitle,
  });

  if (error) {
    return { success: false, error: "Could not add level. Try again." };
  }

  const result = data as AddGoalLevelRpcResult | null;

  if (
    !result?.success ||
    !result.level_id ||
    !result.task_id ||
    !result.goal_id ||
    !result.code
  ) {
    return { success: false, error: rpcErrorMessage(result?.code) };
  }

  return {
    success: true,
    code: result.code,
    levelId: result.level_id,
    taskId: result.task_id,
    goalId: result.goal_id,
    goalStatus: result.goal_status ?? "active",
  };
}

export function mapAddGoalLevelError(code: string | undefined): string {
  return rpcErrorMessage(code);
}
