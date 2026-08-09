import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseGoalLevelId, parseMoveDirection } from "./goal-task-mutation-shared";

export type MoveGoalLevelResult =
  | {
      success: true;
      code: string;
      levelId: string;
      goalId: string;
      direction: string;
      oldPosition: number;
      newPosition: number;
    }
  | { success: false; error: string };

type MoveGoalLevelRpcResult = {
  success: boolean;
  code?: string;
  level_id?: string;
  goal_id?: string;
  direction?: string;
  old_position?: number;
  new_position?: number;
};

const RPC_ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "You must be signed in to reorder this level.",
  invalid_level: "Invalid level.",
  invalid_direction: "Invalid move direction.",
  level_not_found: "Level not found.",
  goal_not_found: "Goal not found.",
  goal_archived: "This archived goal can't be reordered.",
  goal_completed: "This completed goal can no longer be reordered.",
  goal_not_active: "Only active goals can be reordered.",
  malformed_goal_structure: "This goal has an invalid structure and cannot be updated.",
  position_overflow: "This roadmap can't be reordered right now.",
};

function rpcErrorMessage(code: string | undefined): string {
  if (code && RPC_ERROR_MESSAGES[code]) {
    return RPC_ERROR_MESSAGES[code];
  }

  return "Could not move level. Try again.";
}

export async function moveJarvisGoalLevel(
  supabase: SupabaseClient,
  levelId: unknown,
  direction: unknown,
): Promise<MoveGoalLevelResult> {
  const parsedLevelId = parseGoalLevelId(levelId);

  if (!parsedLevelId) {
    return { success: false, error: "Invalid level." };
  }

  const parsedDirection = parseMoveDirection(direction);

  if (!parsedDirection) {
    return { success: false, error: "Invalid move direction." };
  }

  const { data, error } = await supabase.rpc("move_jarvis_goal_level", {
    p_level_id: parsedLevelId,
    p_direction: parsedDirection,
  });

  if (error) {
    return { success: false, error: "Could not move level. Try again." };
  }

  const result = data as MoveGoalLevelRpcResult | null;

  if (!result?.success || !result.level_id || !result.goal_id || !result.code) {
    return { success: false, error: rpcErrorMessage(result?.code) };
  }

  return {
    success: true,
    code: result.code,
    levelId: result.level_id,
    goalId: result.goal_id,
    direction: result.direction ?? parsedDirection,
    oldPosition: result.old_position ?? 0,
    newPosition: result.new_position ?? 0,
  };
}

export function mapMoveGoalLevelError(code: string | undefined): string {
  return rpcErrorMessage(code);
}
