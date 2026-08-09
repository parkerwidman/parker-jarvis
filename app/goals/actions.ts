"use server";

import {
  createJarvisGoalWithRoadmap,
  type GoalBuilderInput,
} from "@/lib/jarvis/goals/create-goal";
import type { JarvisGoalType } from "@/lib/jarvis/goals/types";
import { GOAL_PAGE_CONFIG } from "@/lib/jarvis/goals/types";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type PublishGoalResult =
  | { ok: true; goalId: string }
  | { ok: false; error: string };

async function requireAuthenticatedUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return null;
  }

  return typeof data.claims.sub === "string" ? data.claims.sub : null;
}

async function publishJarvisGoal(
  goalType: JarvisGoalType,
  payload: GoalBuilderInput,
): Promise<PublishGoalResult> {
  const supabase = await createClient();
  const userId = await requireAuthenticatedUser(supabase);

  if (!userId) {
    return { ok: false, error: "You must be signed in to publish a goal." };
  }

  const result = await createJarvisGoalWithRoadmap(supabase, goalType, payload);

  if (!result.success) {
    return { ok: false, error: result.error };
  }

  revalidatePath(GOAL_PAGE_CONFIG[goalType].route);
  revalidatePath("/");

  return { ok: true, goalId: result.goalId };
}

export async function publishShortTermGoal(
  payload: GoalBuilderInput,
): Promise<PublishGoalResult> {
  return publishJarvisGoal("short_term", payload);
}

export async function publishThreeMonthGoal(
  payload: GoalBuilderInput,
): Promise<PublishGoalResult> {
  return publishJarvisGoal("three_month", payload);
}

export async function publishLongTermGoal(
  payload: GoalBuilderInput,
): Promise<PublishGoalResult> {
  return publishJarvisGoal("long_term", payload);
}
