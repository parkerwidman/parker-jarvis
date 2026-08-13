import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseGoalTargetDateInput } from "../goal-dates";
import type { JarvisGoalDomain, JarvisGoalType } from "../types";
import {
  parseAuthenticatedUserId,
  parseGoalId,
} from "./goal-task-mutation-shared";

export type UpdateJarvisGoalMetadataInput = {
  title?: string;
  description?: string | null;
  notes?: string | null;
  targetDate?: string | null;
  clearTargetDate?: boolean;
  domain?: JarvisGoalDomain;
  goalType?: JarvisGoalType;
};

export type UpdateJarvisGoalMetadataResult =
  | {
      success: true;
      goalId: string;
      title: string;
      description: string | null;
      notes: string | null;
      targetDate: string | null;
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
  description?: string | null;
  notes?: string | null;
  target_date?: string | null;
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
  invalid_description: "Description must be 2000 characters or fewer.",
  invalid_notes: "Notes must be 2000 characters or fewer.",
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
  const hasDescription = input.description !== undefined;
  const hasNotes = input.notes !== undefined;
  const hasTargetDate =
    input.targetDate !== undefined || input.clearTargetDate === true;
  const hasDomain = input.domain !== undefined;
  const hasGoalType = input.goalType !== undefined;

  if (
    !hasTitle &&
    !hasDescription &&
    !hasNotes &&
    !hasTargetDate &&
    !hasDomain &&
    !hasGoalType
  ) {
    return { ok: false, error: RPC_ERROR_MESSAGES.no_changes };
  }

  if (hasTitle) {
    const trimmed = input.title?.trim() ?? "";

    if (trimmed.length < 1 || trimmed.length > 200) {
      return { ok: false, error: RPC_ERROR_MESSAGES.invalid_title };
    }
  }

  if (hasDescription) {
    const trimmed = input.description?.trim() ?? "";
    const normalized = trimmed.length > 0 ? trimmed : null;

    if (normalized !== null && normalized.length > 2000) {
      return { ok: false, error: RPC_ERROR_MESSAGES.invalid_description };
    }
  }

  if (hasNotes) {
    const trimmed = input.notes?.trim() ?? "";
    const normalized = trimmed.length > 0 ? trimmed : null;

    if (normalized !== null && normalized.length > 2000) {
      return { ok: false, error: RPC_ERROR_MESSAGES.invalid_notes };
    }
  }

  if (input.targetDate !== undefined && input.targetDate !== null) {
    if (parseGoalTargetDateInput(input.targetDate) === null) {
      return { ok: false, error: "Target date must use YYYY-MM-DD format." };
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
    p_description?: string | null;
    p_notes?: string | null;
    p_target_date?: string | null;
    p_clear_target_date: boolean;
    p_domain?: string;
    p_goal_type?: string;
  } = {
    p_goal_id: parsedGoalId,
    // Always send a parameter unique to the D4.1 metadata RPC so PostgREST
    // does not resolve the legacy 4-arg overload when both exist.
    p_clear_target_date: input.clearTargetDate === true,
  };

  if (input.title !== undefined) {
    rpcArgs.p_title = input.title.trim();
  }

  if (input.description !== undefined) {
    const trimmed = input.description?.trim() ?? "";
    // Empty string means "clear" — SQL treats NULL as "field omitted".
    rpcArgs.p_description = trimmed.length > 0 ? trimmed : "";
  }

  if (input.notes !== undefined) {
    const trimmed = input.notes?.trim() ?? "";
    rpcArgs.p_notes = trimmed.length > 0 ? trimmed : "";
  }

  if (input.targetDate !== undefined && !input.clearTargetDate) {
    rpcArgs.p_target_date = input.targetDate
      ? parseGoalTargetDateInput(input.targetDate)
      : null;
  }

  if (input.domain !== undefined) {
    rpcArgs.p_domain = input.domain;
  }

  if (input.goalType !== undefined) {
    rpcArgs.p_goal_type = input.goalType;
  }

  const { data, error } = await supabase.rpc("update_jarvis_goal_metadata", rpcArgs);

  if (error) {
    console.error("[updateJarvisGoalMetadata] rpc failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
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
    description: result.description ?? null,
    notes: result.notes ?? null,
    targetDate: result.target_date ?? null,
    domain: result.domain,
    goalType: result.goal_type,
    status: result.status,
  };
}

export function mapUpdateJarvisGoalMetadataError(code: string | undefined): string {
  return rpcErrorMessage(code);
}
