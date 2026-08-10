import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAuthenticatedUserId, parseGoalId } from "./goal-task-mutation-shared";

export type RestoreJarvisGoalResult =
  | {
      success: true;
      code: string;
      goalId: string;
      status: string;
      completedAt: string | null;
    }
  | { success: false; error: string };

type RestoreGoalRpcResult = {
  success: boolean;
  code?: string;
  goal_id?: string;
  status?: string;
  completed_at?: string | null;
};

const RPC_ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "You must be signed in to restore this goal.",
  invalid_goal: "Invalid goal.",
  goal_not_found: "Goal not found.",
  goal_not_archived: "Only archived goals can be restored.",
};

function rpcErrorMessage(code: string | undefined): string {
  if (code && RPC_ERROR_MESSAGES[code]) {
    return RPC_ERROR_MESSAGES[code];
  }

  return "Could not restore goal. Try again.";
}

export async function restoreJarvisGoal(
  supabase: SupabaseClient,
  userId: unknown,
  goalId: unknown,
): Promise<RestoreJarvisGoalResult> {
  const parsedUserId = parseAuthenticatedUserId(userId);

  if (!parsedUserId) {
    return { success: false, error: RPC_ERROR_MESSAGES.unauthenticated };
  }

  const parsedGoalId = parseGoalId(goalId);

  if (!parsedGoalId) {
    return { success: false, error: RPC_ERROR_MESSAGES.invalid_goal };
  }

  const { data, error } = await supabase.rpc("restore_jarvis_goal", {
    p_goal_id: parsedGoalId,
  });

  if (error) {
    return { success: false, error: "Could not restore goal. Try again." };
  }

  const result = data as RestoreGoalRpcResult | null;

  if (!result?.success || !result.goal_id || !result.code || !result.status) {
    return { success: false, error: rpcErrorMessage(result?.code) };
  }

  return {
    success: true,
    code: result.code,
    goalId: result.goal_id,
    status: result.status,
    completedAt: result.completed_at ?? null,
  };
}

export function mapRestoreJarvisGoalError(code: string | undefined): string {
  return rpcErrorMessage(code);
}
