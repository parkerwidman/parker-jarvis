import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { JarvisGoalDomain, JarvisGoalType } from "../types";
import {
  parseAuthenticatedUserId,
  parseGoalId,
} from "./goal-task-mutation-shared";

export type UpdateJarvisGoalMetadataInput = {
  title?: string;
  domain?: JarvisGoalDomain;
  goalType?: JarvisGoalType;
};

export type UpdateJarvisGoalMetadataResult =
  | {
      success: true;
      goalId: string;
      title: string;
      domain: JarvisGoalDomain;
      goalType: JarvisGoalType;
      status: string;
    }
  | { success: false; error: string };

type UpdateGoalMetadataRpcResult = {
  success: boolean;
  code?: string;
  goal_id?: string;
  title?: string;
  domain?: string;
  goal_type?: string;
  status?: string;
};

const RPC_ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "You must be signed in to update this goal.",
  invalid_goal: "Invalid goal.",
  no_changes: "No goal changes were provided.",
  goal_not_found: "Goal not found.",
  goal_archived: "Archived goals cannot be edited. Restore the goal first.",
  goal_not_editable: "This goal cannot be edited.",
  invalid_title: "Goal title must be between 1 and 200 characters.",
  invalid_domain: "Choose Personal or Melusi.",
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

  return "Could not update goal. Try again.";
}

export function validateUpdateJarvisGoalMetadataInput(
  input: UpdateJarvisGoalMetadataInput,
): { ok: true } | { ok: false; error: string } {
  const hasTitle = input.title !== undefined;
  const hasDomain = input.domain !== undefined;
  const hasGoalType = input.goalType !== undefined;

  if (!hasTitle && !hasDomain && !hasGoalType) {
    return { ok: false, error: RPC_ERROR_MESSAGES.no_changes };
  }

  if (hasTitle) {
    const trimmed = input.title?.trim() ?? "";

    if (trimmed.length < 1 || trimmed.length > 200) {
      return { ok: false, error: RPC_ERROR_MESSAGES.invalid_title };
    }
  }

  if (hasDomain && input.domain !== undefined && !isJarvisGoalDomain(input.domain)) {
    return { ok: false, error: RPC_ERROR_MESSAGES.invalid_domain };
  }

  if (hasGoalType && input.goalType !== undefined && !isJarvisGoalType(input.goalType)) {
    return { ok: false, error: RPC_ERROR_MESSAGES.invalid_goal_type };
  }

  return { ok: true };
}

export async function updateJarvisGoalMetadata(
  supabase: SupabaseClient,
  userId: unknown,
  goalId: unknown,
  input: UpdateJarvisGoalMetadataInput,
): Promise<UpdateJarvisGoalMetadataResult> {
  const parsedUserId = parseAuthenticatedUserId(userId);

  if (!parsedUserId) {
    return { success: false, error: RPC_ERROR_MESSAGES.unauthenticated };
  }

  const parsedGoalId = parseGoalId(goalId);

  if (!parsedGoalId) {
    return { success: false, error: RPC_ERROR_MESSAGES.invalid_goal };
  }

  const validated = validateUpdateJarvisGoalMetadataInput(input);

  if (!validated.ok) {
    return { success: false, error: validated.error };
  }

  const rpcArgs: {
    p_goal_id: string;
    p_title?: string;
    p_domain?: string;
    p_goal_type?: string;
  } = {
    p_goal_id: parsedGoalId,
  };

  if (input.title !== undefined) {
    rpcArgs.p_title = input.title.trim();
  }

  if (input.domain !== undefined) {
    rpcArgs.p_domain = input.domain;
  }

  if (input.goalType !== undefined) {
    rpcArgs.p_goal_type = input.goalType;
  }

  const { data, error } = await supabase.rpc("update_jarvis_goal_metadata", rpcArgs);

  if (error) {
    return { success: false, error: "Could not update goal. Try again." };
  }

  const result = data as UpdateGoalMetadataRpcResult | null;

  if (
    !result?.success ||
    !result.goal_id ||
    !result.title ||
    !result.domain ||
    !result.goal_type ||
    !result.status
  ) {
    return { success: false, error: rpcErrorMessage(result?.code) };
  }

  if (!isJarvisGoalDomain(result.domain) || !isJarvisGoalType(result.goal_type)) {
    return { success: false, error: "Could not update goal. Try again." };
  }

  return {
    success: true,
    goalId: result.goal_id,
    title: result.title,
    domain: result.domain,
    goalType: result.goal_type,
    status: result.status,
  };
}

export function mapUpdateJarvisGoalMetadataError(code: string | undefined): string {
  return rpcErrorMessage(code);
}
