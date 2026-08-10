import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAuthenticatedUserId, parseGoalId } from "./goal-task-mutation-shared";

export type ArchiveJarvisGoalResult =
  | {
      success: true;
      code: string;
      goalId: string;
      status: string;
      completedAt: string | null;
    }
  | { success: false; error: string };

type ArchiveGoalRpcResult = {
  success: boolean;
  code?: string;
  goal_id?: string;
  status?: string;
  completed_at?: string | null;
};

const RPC_ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "You must be signed in to archive this goal.",
  invalid_goal: "Invalid goal.",
  goal_not_found: "Goal not found.",
  goal_not_archivable: "This goal cannot be archived.",
};

function rpcErrorMessage(code: string | undefined): string {
  if (code && RPC_ERROR_MESSAGES[code]) {
    return RPC_ERROR_MESSAGES[code];
  }

  return "Could not archive goal. Try again.";
}

export async function archiveJarvisGoal(
  supabase: SupabaseClient,
  userId: unknown,
  goalId: unknown,
): Promise<ArchiveJarvisGoalResult> {
  const parsedUserId = parseAuthenticatedUserId(userId);

  if (!parsedUserId) {
    return { success: false, error: RPC_ERROR_MESSAGES.unauthenticated };
  }

  const parsedGoalId = parseGoalId(goalId);

  if (!parsedGoalId) {
    return { success: false, error: RPC_ERROR_MESSAGES.invalid_goal };
  }

  const { data, error } = await supabase.rpc("archive_jarvis_goal", {
    p_goal_id: parsedGoalId,
  });

  if (error) {
    return { success: false, error: "Could not archive goal. Try again." };
  }

  const result = data as ArchiveGoalRpcResult | null;

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

export function mapArchiveJarvisGoalError(code: string | undefined): string {
  return rpcErrorMessage(code);
}
