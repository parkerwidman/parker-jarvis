import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GOAL_LEVEL_NAME_MAX_LENGTH,
  loadGoalLevelMutationContext,
  parseAuthenticatedUserId,
  parseGoalLevelId,
} from "./goal-task-mutation-shared";

export type EditGoalLevelNameResult =
  | { success: true; levelId: string; name: string }
  | { success: false; error: string };

function normalizeLevelName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function editJarvisGoalLevelName(
  supabase: SupabaseClient,
  userId: unknown,
  levelId: unknown,
  name: unknown,
): Promise<EditGoalLevelNameResult> {
  const parsedUserId = parseAuthenticatedUserId(userId);

  if (!parsedUserId) {
    return { success: false, error: "You must be signed in to update this level." };
  }

  const parsedLevelId = parseGoalLevelId(levelId);

  if (!parsedLevelId) {
    return { success: false, error: "Invalid level." };
  }

  if (typeof name !== "string") {
    return { success: false, error: "Level name must be between 1 and 200 characters." };
  }

  const normalizedName = normalizeLevelName(name);

  if (normalizedName === null) {
    return { success: false, error: "Level name must be between 1 and 200 characters." };
  }

  if (normalizedName.length > GOAL_LEVEL_NAME_MAX_LENGTH) {
    return { success: false, error: "Level name must be between 1 and 200 characters." };
  }

  const loaded = await loadGoalLevelMutationContext(
    supabase,
    parsedUserId,
    parsedLevelId,
  );

  if (!("levelId" in loaded)) {
    return { success: false, error: loaded.error };
  }

  const level = loaded;

  if (level.levelName === normalizedName) {
    return { success: true, levelId: level.levelId, name: normalizedName };
  }

  const { data, error } = await supabase
    .from("jarvis_goal_levels")
    .update({
      name: normalizedName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", level.levelId)
    .eq("user_id", parsedUserId)
    .select("id, name")
    .maybeSingle();

  if (error || !data) {
    return { success: false, error: "Could not update level. Try again." };
  }

  return { success: true, levelId: data.id, name: data.name };
}
