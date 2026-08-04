import "server-only";

import {
  loadTrustedMelusiProject,
  resolveMelusiProject,
  type TrustedMelusiProject,
} from "@/lib/jarvis/projects/project-task-tools";
import type { SupabaseClient } from "@supabase/supabase-js";

export const VALID_UPDATE_TYPES = new Set([
  "progress",
  "blocker",
  "decision",
  "note",
]);

export const MAX_UPDATE_CONTENT_LENGTH = 5000;

export const DEFAULT_UPDATE_LIST_LIMIT = 20;

export const WORKSPACE_UPDATE_LIST_LIMIT = 15;

export const ASSISTANT_CONTEXT_UPDATE_LIMIT = 6;

const UPDATE_SELECT =
  "id, update_type, content, created_at, updated_at";

export type ProjectUpdateRecord = {
  id: string;
  update_type: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type AssistantProjectUpdateSummary = {
  updateType: string;
  content: string;
  recordedAt: string;
};

export type ListProjectUpdatesResult =
  | { success: true; updates: ProjectUpdateRecord[] }
  | { success: false; error: string };

export type CreateProjectUpdateResult =
  | { success: true; update: ProjectUpdateRecord }
  | { success: false; error: string };

export type CreateMelusiProjectUpdateResult =
  | { success: true; update: AssistantProjectUpdateSummary }
  | {
      success: false;
      error: string;
      matches?: Array<{ name: string; status: string; priority: string }>;
    };

export type ListMelusiProjectUpdatesResult =
  | { success: true; updates: AssistantProjectUpdateSummary[] }
  | {
      success: false;
      error: string;
      matches?: Array<{ name: string; status: string; priority: string }>;
    };

const CONTEXT_TYPE_WEIGHT: Record<string, number> = {
  blocker: 0,
  decision: 1,
  progress: 2,
  note: 3,
};

function clampLimit(limit: number | undefined, fallback: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(limit), 1), DEFAULT_UPDATE_LIST_LIMIT);
}

function toAssistantProjectUpdateSummary(
  update: ProjectUpdateRecord,
): AssistantProjectUpdateSummary {
  return {
    updateType: update.update_type,
    content: update.content,
    recordedAt: update.created_at,
  };
}

function validateUpdateType(updateType: string): string | null {
  const normalized = updateType.trim().toLowerCase();

  if (!VALID_UPDATE_TYPES.has(normalized)) {
    return null;
  }

  return normalized;
}

function validateUpdateContent(content: string): string | null {
  const trimmed = content.trim();

  if (!trimmed || trimmed.length > MAX_UPDATE_CONTENT_LENGTH) {
    return null;
  }

  return trimmed;
}

export async function listProjectUpdates(
  supabase: SupabaseClient,
  userId: string,
  project: TrustedMelusiProject,
  options?: {
    updateType?: string;
    limit?: number;
  },
): Promise<ListProjectUpdatesResult> {
  const limit = clampLimit(options?.limit, DEFAULT_UPDATE_LIST_LIMIT);
  const typeFilter = options?.updateType?.trim().toLowerCase() ?? "";

  if (typeFilter && !VALID_UPDATE_TYPES.has(typeFilter)) {
    return { success: false, error: "Invalid update type filter." };
  }

  let query = supabase
    .from("project_updates")
    .select(UPDATE_SELECT)
    .eq("user_id", userId)
    .eq("project_id", project.id)
    .eq("life_area_id", project.life_area_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (typeFilter) {
    query = query.eq("update_type", typeFilter);
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Could not list project updates." };
  }

  return { success: true, updates: data ?? [] };
}

export async function createProjectUpdate(
  supabase: SupabaseClient,
  userId: string,
  project: TrustedMelusiProject,
  input: {
    updateType: string;
    content: string;
  },
): Promise<CreateProjectUpdateResult> {
  const updateType = validateUpdateType(input.updateType);
  const content = validateUpdateContent(input.content);

  if (!updateType) {
    return {
      success: false,
      error: "Update type must be progress, blocker, decision, or note.",
    };
  }

  if (!content) {
    return {
      success: false,
      error: `Content must be between 1 and ${MAX_UPDATE_CONTENT_LENGTH} characters.`,
    };
  }

  const { data, error } = await supabase
    .from("project_updates")
    .insert({
      user_id: userId,
      project_id: project.id,
      life_area_id: project.life_area_id,
      update_type: updateType,
      content,
    })
    .select(UPDATE_SELECT)
    .single();

  if (error || !data) {
    return { success: false, error: "Could not create project update." };
  }

  return { success: true, update: data };
}

export function selectUpdatesForAssistantContext(
  updates: ProjectUpdateRecord[],
  limit = ASSISTANT_CONTEXT_UPDATE_LIMIT,
): ProjectUpdateRecord[] {
  return [...updates]
    .sort((a, b) => {
      const aWeight = CONTEXT_TYPE_WEIGHT[a.update_type] ?? 4;
      const bWeight = CONTEXT_TYPE_WEIGHT[b.update_type] ?? 4;

      if (aWeight !== bWeight) {
        return aWeight - bWeight;
      }

      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    })
    .slice(0, limit);
}

export async function loadRecentProjectUpdatesForContext(
  supabase: SupabaseClient,
  userId: string,
  project: TrustedMelusiProject,
): Promise<ProjectUpdateRecord[]> {
  const result = await listProjectUpdates(supabase, userId, project, {
    limit: DEFAULT_UPDATE_LIST_LIMIT,
  });

  if (!result.success) {
    return [];
  }

  return selectUpdatesForAssistantContext(result.updates);
}

export async function createMelusiProjectUpdate(
  supabase: SupabaseClient,
  userId: string,
  input: {
    projectId?: string;
    projectName?: string;
    updateType: string;
    content: string;
  },
): Promise<CreateMelusiProjectUpdateResult> {
  const projectResult = await resolveMelusiProject(supabase, userId, {
    projectId: input.projectId,
    projectName: input.projectName,
  });

  if (!projectResult.success) {
    return projectResult;
  }

  const result = await createProjectUpdate(
    supabase,
    userId,
    projectResult.project,
    {
      updateType: input.updateType,
      content: input.content,
    },
  );

  if (!result.success) {
    return result;
  }

  return {
    success: true,
    update: toAssistantProjectUpdateSummary(result.update),
  };
}

export async function listMelusiProjectUpdates(
  supabase: SupabaseClient,
  userId: string,
  input: {
    projectId?: string;
    projectName?: string;
    updateType?: string;
    limit?: number;
  },
): Promise<ListMelusiProjectUpdatesResult> {
  const projectResult = await resolveMelusiProject(supabase, userId, {
    projectId: input.projectId,
    projectName: input.projectName,
  });

  if (!projectResult.success) {
    return projectResult;
  }

  const result = await listProjectUpdates(
    supabase,
    userId,
    projectResult.project,
    {
      updateType: input.updateType,
      limit: input.limit,
    },
  );

  if (!result.success) {
    return result;
  }

  return {
    success: true,
    updates: result.updates.map(toAssistantProjectUpdateSummary),
  };
}

export async function loadTrustedMelusiProjectUpdates(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  options?: {
    updateType?: string;
    limit?: number;
  },
): Promise<ListProjectUpdatesResult> {
  const projectResult = await loadTrustedMelusiProject(
    supabase,
    userId,
    projectId,
  );

  if (!projectResult.success) {
    return { success: false, error: "Project not found." };
  }

  return listProjectUpdates(supabase, userId, projectResult.project, options);
}
