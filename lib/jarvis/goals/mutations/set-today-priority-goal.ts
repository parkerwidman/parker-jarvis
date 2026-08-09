import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseAuthenticatedUserId,
  parseGoalTaskId,
} from "./goal-task-mutation-shared";

export type SetTodayPriorityGoalResult =
  | { success: true; goalId: string }
  | { success: false; error: string };

export type ClearTodayPriorityGoalResult =
  | { success: true }
  | { success: false; error: string };

type PriorityGoalRow = {
  id: string;
  goal_type: string;
  status: string;
};

type PriorityProfileRow = {
  today_priority_goal_id: string | null;
};

function goalPriorityError(status: string, goalType: string): string | null {
  if (goalType !== "short_term") {
    return "Only Short Term goals can be Today's Priority.";
  }

  if (status === "archived") {
    return "Archived goals cannot be Today's Priority.";
  }

  if (status === "completed") {
    return "Completed goals cannot be Today's Priority.";
  }

  if (status !== "active") {
    return "Only active goals can be Today's Priority.";
  }

  return null;
}

export async function setJarvisTodayPriorityGoal(
  supabase: SupabaseClient,
  userId: unknown,
  goalId: unknown,
): Promise<SetTodayPriorityGoalResult> {
  const parsedUserId = parseAuthenticatedUserId(userId);

  if (!parsedUserId) {
    return { success: false, error: "You must be signed in to update Today's Priority." };
  }

  const parsedGoalId = parseGoalTaskId(goalId);

  if (!parsedGoalId) {
    return { success: false, error: "Invalid goal." };
  }

  const { data: goal, error: goalError } = await supabase
    .from("jarvis_goals")
    .select("id, goal_type, status")
    .eq("id", parsedGoalId)
    .eq("user_id", parsedUserId)
    .maybeSingle();

  if (goalError) {
    return { success: false, error: "Could not update Today's Priority. Try again." };
  }

  if (!goal) {
    return { success: false, error: "Goal not found." };
  }

  const goalRow = goal as PriorityGoalRow;
  const validationError = goalPriorityError(goalRow.status, goalRow.goal_type);

  if (validationError) {
    return { success: false, error: validationError };
  }

  const { data: profile, error: profileReadError } = await supabase
    .from("jarvis_profiles")
    .select("today_priority_goal_id")
    .eq("user_id", parsedUserId)
    .maybeSingle();

  if (profileReadError) {
    return { success: false, error: "Could not update Today's Priority. Try again." };
  }

  if (!profile) {
    return { success: false, error: "Profile not found." };
  }

  const profileRow = profile as PriorityProfileRow;

  if (profileRow.today_priority_goal_id === parsedGoalId) {
    return { success: true, goalId: parsedGoalId };
  }

  const { data: updated, error: updateError } = await supabase
    .from("jarvis_profiles")
    .update({
      today_priority_goal_id: parsedGoalId,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", parsedUserId)
    .select("today_priority_goal_id")
    .maybeSingle();

  if (updateError || !updated) {
    return { success: false, error: "Could not update Today's Priority. Try again." };
  }

  const updatedRow = updated as PriorityProfileRow;

  return {
    success: true,
    goalId: updatedRow.today_priority_goal_id ?? parsedGoalId,
  };
}

export async function clearJarvisTodayPriorityGoal(
  supabase: SupabaseClient,
  userId: unknown,
): Promise<ClearTodayPriorityGoalResult> {
  const parsedUserId = parseAuthenticatedUserId(userId);

  if (!parsedUserId) {
    return { success: false, error: "You must be signed in to update Today's Priority." };
  }

  const { data: profile, error: profileReadError } = await supabase
    .from("jarvis_profiles")
    .select("today_priority_goal_id")
    .eq("user_id", parsedUserId)
    .maybeSingle();

  if (profileReadError) {
    return { success: false, error: "Could not update Today's Priority. Try again." };
  }

  if (!profile) {
    return { success: false, error: "Profile not found." };
  }

  const profileRow = profile as PriorityProfileRow;

  if (profileRow.today_priority_goal_id === null) {
    return { success: true };
  }

  const { data: updated, error: updateError } = await supabase
    .from("jarvis_profiles")
    .update({
      today_priority_goal_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", parsedUserId)
    .select("today_priority_goal_id")
    .maybeSingle();

  if (updateError || !updated) {
    return { success: false, error: "Could not update Today's Priority. Try again." };
  }

  return { success: true };
}
