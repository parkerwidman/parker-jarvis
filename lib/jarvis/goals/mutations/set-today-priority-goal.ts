import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { JarvisGoalDomain, JarvisGoalType } from "../types";
import {
  parseAuthenticatedUserId,
  parseGoalTaskId,
} from "./goal-task-mutation-shared";

export type SetGoalPriorityResult =
  | { success: true; goalId: string; domain: JarvisGoalDomain; goalType: JarvisGoalType }
  | { success: false; error: string };

export type ClearGoalPriorityResult =
  | { success: true }
  | { success: false; error: string };

type SetGoalPriorityRpcResult = {
  success: boolean;
  code?: string;
  goal_id?: string;
  domain?: string;
  goal_type?: string;
};

type ClearGoalPriorityRpcResult = {
  success: boolean;
  code?: string;
};

const RPC_ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "You must be signed in to update Current Priority.",
  invalid_goal: "Invalid goal.",
  goal_not_found: "Goal not found.",
  goal_archived: "Archived goals cannot be Current Priority.",
  goal_completed: "Completed goals cannot be Current Priority.",
  goal_not_active: "Only active goals can be Current Priority.",
  invalid_domain: "Invalid workspace.",
  invalid_goal_type: "Invalid goal horizon.",
};

function isJarvisGoalDomain(value: string): value is JarvisGoalDomain {
  return value === "personal" || value === "melusi";
}

function isJarvisGoalType(value: string): value is JarvisGoalType {
  return value === "short_term" || value === "three_month" || value === "long_term";
}

function rpcErrorMessage(code: string | undefined): string {
  if (code && RPC_ERROR_MESSAGES[code]) {
    return RPC_ERROR_MESSAGES[code];
  }

  return "Could not update Current Priority. Try again.";
}

export async function setJarvisGoalPriority(
  supabase: SupabaseClient,
  userId: unknown,
  goalId: unknown,
): Promise<SetGoalPriorityResult> {
  const parsedUserId = parseAuthenticatedUserId(userId);

  if (!parsedUserId) {
    return { success: false, error: RPC_ERROR_MESSAGES.unauthenticated };
  }

  const parsedGoalId = parseGoalTaskId(goalId);

  if (!parsedGoalId) {
    return { success: false, error: RPC_ERROR_MESSAGES.invalid_goal };
  }

  const { data, error } = await supabase.rpc("set_jarvis_goal_priority", {
    p_goal_id: parsedGoalId,
  });

  if (error) {
    return { success: false, error: "Could not update Current Priority. Try again." };
  }

  const result = data as SetGoalPriorityRpcResult | null;

  if (
    !result?.success ||
    !result.goal_id ||
    !result.domain ||
    !result.goal_type ||
    !isJarvisGoalDomain(result.domain) ||
    !isJarvisGoalType(result.goal_type)
  ) {
    return { success: false, error: rpcErrorMessage(result?.code) };
  }

  return {
    success: true,
    goalId: result.goal_id,
    domain: result.domain,
    goalType: result.goal_type,
  };
}

export async function clearJarvisGoalPriority(
  supabase: SupabaseClient,
  userId: unknown,
  domain: unknown,
  goalType: unknown,
): Promise<ClearGoalPriorityResult> {
  const parsedUserId = parseAuthenticatedUserId(userId);

  if (!parsedUserId) {
    return { success: false, error: RPC_ERROR_MESSAGES.unauthenticated };
  }

  if (!isJarvisGoalDomain(domain as string)) {
    return { success: false, error: RPC_ERROR_MESSAGES.invalid_domain };
  }

  if (!isJarvisGoalType(goalType as string)) {
    return { success: false, error: RPC_ERROR_MESSAGES.invalid_goal_type };
  }

  const { data, error } = await supabase.rpc("clear_jarvis_goal_priority", {
    p_domain: domain,
    p_goal_type: goalType,
  });

  if (error) {
    return { success: false, error: "Could not update Current Priority. Try again." };
  }

  const result = data as ClearGoalPriorityRpcResult | null;

  if (!result?.success) {
    return { success: false, error: rpcErrorMessage(result?.code) };
  }

  return { success: true };
}

/** @deprecated Use setJarvisGoalPriority */
export const setJarvisTodayPriorityGoal = setJarvisGoalPriority;

/** @deprecated Use clearJarvisGoalPriority */
export async function clearJarvisTodayPriorityGoal(
  supabase: SupabaseClient,
  userId: unknown,
  domain: JarvisGoalDomain = "personal",
  goalType: JarvisGoalType = "short_term",
): Promise<ClearGoalPriorityResult> {
  return clearJarvisGoalPriority(supabase, userId, domain, goalType);
}
