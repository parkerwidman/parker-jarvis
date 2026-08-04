import "server-only";

import { ensureLifeAreaForModule } from "@/lib/jarvis/life-areas/ensure-life-area-for-module";
import {
  loadTrustedMelusiProject,
  listProjectTasks,
  type ProjectTaskRecord,
  type TrustedMelusiProject,
} from "@/lib/jarvis/projects/project-task-tools";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_TIMEZONE = "America/Chicago";

const PRIORITY_WEIGHT: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MelusiProjectWorkspaceTask = {
  id: string;
  title: string;
  priority: string;
  dueAt: string | null;
  overdue: boolean;
  status: string;
};

export type MelusiProjectWorkspaceData = {
  project: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    priority: string;
    dueAt: string | null;
  };
  unfinishedTasks: MelusiProjectWorkspaceTask[];
  completedTasks: MelusiProjectWorkspaceTask[];
  taskCounts: {
    total: number;
    completed: number;
    unfinished: number;
  };
  timezone: string;
};

function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

function resolveTimeZone(profileTimezone: string | null | undefined): string {
  const candidate = profileTimezone?.trim();

  if (candidate && isValidTimeZone(candidate)) {
    return candidate;
  }

  return DEFAULT_TIMEZONE;
}

function getLocalDateString(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function getLocalDateFromIso(isoString: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoString));
}

function isTaskOverdue(
  dueAt: string | null,
  todayLocal: string,
  timeZone: string,
): boolean {
  if (!dueAt) {
    return false;
  }

  return getLocalDateFromIso(dueAt, timeZone) < todayLocal;
}

function compareUnfinishedTasks(
  a: ProjectTaskRecord,
  b: ProjectTaskRecord,
  todayLocal: string,
  timeZone: string,
): number {
  const aOverdue = isTaskOverdue(a.due_at, todayLocal, timeZone);
  const bOverdue = isTaskOverdue(b.due_at, todayLocal, timeZone);

  if (aOverdue !== bOverdue) {
    return aOverdue ? -1 : 1;
  }

  const aDue = a.due_at
    ? new Date(a.due_at).getTime()
    : Number.POSITIVE_INFINITY;
  const bDue = b.due_at
    ? new Date(b.due_at).getTime()
    : Number.POSITIVE_INFINITY;

  if (aDue !== bDue) {
    return aDue - bDue;
  }

  const aPriority = PRIORITY_WEIGHT[a.priority] ?? 1;
  const bPriority = PRIORITY_WEIGHT[b.priority] ?? 1;

  if (aPriority !== bPriority) {
    return aPriority - bPriority;
  }

  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function toWorkspaceTask(
  row: ProjectTaskRecord,
  todayLocal: string,
  timeZone: string,
): MelusiProjectWorkspaceTask {
  return {
    id: row.id,
    title: row.title,
    priority: row.priority,
    dueAt: row.due_at,
    overdue: isTaskOverdue(row.due_at, todayLocal, timeZone),
    status: row.status,
  };
}

export async function loadMelusiProjectWorkspace(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
): Promise<
  | { success: true; data: MelusiProjectWorkspaceData }
  | { success: false; notFound: true }
> {
  const projectResult = await loadTrustedMelusiProject(
    supabase,
    userId,
    projectId,
  );

  if (!projectResult.success) {
    return { success: false, notFound: true };
  }

  const { data: profileRow } = await supabase
    .from("jarvis_profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();

  const timezone = resolveTimeZone(profileRow?.timezone ?? null);
  const todayLocal = getLocalDateString(timezone);

  const tasksResult = await listProjectTasks(
    supabase,
    userId,
    projectResult.project,
  );

  if (!tasksResult.success) {
    return { success: false, notFound: true };
  }

  const unfinishedRows = tasksResult.tasks.filter(
    (task) => task.status !== "done",
  );
  const completedRows = tasksResult.tasks.filter(
    (task) => task.status === "done",
  );

  const unfinishedTasks = [...unfinishedRows]
    .sort((a, b) => compareUnfinishedTasks(a, b, todayLocal, timezone))
    .map((row) => toWorkspaceTask(row, todayLocal, timezone));

  const completedTasks = [...completedRows]
    .sort(
      (a, b) =>
        new Date(b.completed_at ?? b.created_at).getTime() -
        new Date(a.completed_at ?? a.created_at).getTime(),
    )
    .map((row) => toWorkspaceTask(row, todayLocal, timezone));

  const project = projectResult.project as ProjectRow;

  return {
    success: true,
    data: {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        priority: project.priority,
        dueAt: project.due_at,
      },
      unfinishedTasks,
      completedTasks,
      taskCounts: {
        total: tasksResult.tasks.length,
        completed: completedTasks.length,
        unfinished: unfinishedTasks.length,
      },
      timezone,
    },
  };
}

export type { TrustedMelusiProject };
