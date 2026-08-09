import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseGoalLevelId } from "./goal-task-mutation-shared";

export type DeleteGoalLevelResult =
  | {
      success: true;
      code: string;
      levelId: string;
      goalId: string;
      deletedTaskCount: number;
      goalStatus: string;
    }
  | { success: false; error: string };

type DeleteGoalLevelRpcResult = {
  success: boolean;
  code?: string;
  level_id?: string;
  goal_id?: string;
  deleted_task_count?: number;
  goal_status?: string;
};

const RPC_ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "You must be signed in to delete a level.",
  invalid_level: "Invalid level.",
  level_not_found: "Level not found.",
  goal_not_found: "Goal not found.",
  goal_archived: "Archived goals cannot be updated.",
  goal_completed: "Completed goals are historical and cannot be changed.",
  goal_not_active: "Only active goals can be changed.",
  last_level_in_goal: "A goal must keep at least one level.",
  level_busy: "This level is being updated. Try deleting it again.",
  malformed_goal_structure: "This goal has an invalid structure and cannot be updated.",
};

function rpcErrorMessage(code: string | undefined): string {
  if (code && RPC_ERROR_MESSAGES[code]) {
    return RPC_ERROR_MESSAGES[code];
  }

  return "Could not delete level. Try again.";
}

export async function deleteJarvisGoalLevel(
  supabase: SupabaseClient,
  levelId: unknown,
): Promise<DeleteGoalLevelResult> {
  const parsedLevelId = parseGoalLevelId(levelId);

  if (!parsedLevelId) {
    return { success: false, error: "Invalid level." };
  }

  const { data, error } = await supabase.rpc("delete_jarvis_goal_level", {
    p_level_id: parsedLevelId,
  });

  if (error) {
    return { success: false, error: "Could not delete level. Try again." };
  }

  const result = data as DeleteGoalLevelRpcResult | null;

  if (!result?.success || !result.level_id || !result.goal_id || !result.code) {
    return { success: false, error: rpcErrorMessage(result?.code) };
  }

  return {
    success: true,
    code: result.code,
    levelId: result.level_id,
    goalId: result.goal_id,
    deletedTaskCount: result.deleted_task_count ?? 0,
    goalStatus: result.goal_status ?? "active",
  };
}

export function mapDeleteGoalLevelError(code: string | undefined): string {
  return rpcErrorMessage(code);
}
