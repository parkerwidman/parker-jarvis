import "server-only";

import { ensureLifeAreaForModule } from "@/lib/jarvis/life-areas/ensure-life-area-for-module";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_TIMEZONE = "America/Chicago";
const DUE_SOON_DAYS = 3;
const MAX_ACTIVE_PROJECTS = 8;
const MAX_PAUSED_PROJECTS = 4;
const MAX_TASKS_PER_LIST = 6;
const MAX_UNFINISHED_TASKS = 100;

const PRIORITY_WEIGHT: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const ACTIVE_PROJECT_STATUSES = new Set(["active", "idea"]);

type ProjectRow = {
  id: string;
  name: string;
  status: string;
  priority: string;
  due_at: string | null;
  updated_at: string;
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  project_id: string;
  updated_at: string;
};

type TaskCountRow = {
  id: string;
  status: string;
  project_id: string | null;
};

export type MelusiPlanningSnapshotTask = {
  id: string;
  title: string;
  priority: string;
  due_at: string | null;
  overdue: boolean;
  dueSoon: boolean;
  projectId: string;
  projectName: string;
};

export type MelusiPlanningSnapshotProject = {
  id: string;
  name: string;
  status: string;
  priority: string;
  due_at: string | null;
  taskCounts: {
    total: number;
    completed: number;
    unfinished: number;
  };
};

export type MelusiPlanningSnapshotProjectNeedingAttention = {
  id: string;
  name: string;
  status: string;
  reason: "no_open_next_task";
};

export type MelusiPlanningSnapshot = {
  hasMeaningfulActivity: boolean;
  activeProjects: MelusiPlanningSnapshotProject[];
  pausedProjects: MelusiPlanningSnapshotProject[];
  overdueTasks: MelusiPlanningSnapshotTask[];
  dueSoonTasks: MelusiPlanningSnapshotTask[];
  highPriorityTasks: MelusiPlanningSnapshotTask[];
  projectsWithoutOpenTasks: MelusiPlanningSnapshotProjectNeedingAttention[];
  projectNameByTaskId: Record<string, string>;
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

function addDaysToLocalDate(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
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

function isTaskDueSoon(
  dueAt: string | null,
  todayLocal: string,
  dueSoonEndLocal: string,
  timeZone: string,
): boolean {
  if (!dueAt) {
    return false;
  }

  const dueLocal = getLocalDateFromIso(dueAt, timeZone);
  return dueLocal >= todayLocal && dueLocal <= dueSoonEndLocal;
}

function compareTasksByRelevance(
  a: TaskRow,
  b: TaskRow,
  todayLocal: string,
  dueSoonEndLocal: string,
  timeZone: string,
): number {
  const aOverdue = isTaskOverdue(a.due_at, todayLocal, timeZone);
  const bOverdue = isTaskOverdue(b.due_at, todayLocal, timeZone);

  if (aOverdue !== bOverdue) {
    return aOverdue ? -1 : 1;
  }

  const aDueSoon = isTaskDueSoon(
    a.due_at,
    todayLocal,
    dueSoonEndLocal,
    timeZone,
  );
  const bDueSoon = isTaskDueSoon(
    b.due_at,
    todayLocal,
    dueSoonEndLocal,
    timeZone,
  );

  if (aDueSoon !== bDueSoon) {
    return aDueSoon ? -1 : 1;
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

  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}

function compareProjectsByRelevance(a: ProjectRow, b: ProjectRow): number {
  const aActive = ACTIVE_PROJECT_STATUSES.has(a.status) ? 0 : 1;
  const bActive = ACTIVE_PROJECT_STATUSES.has(b.status) ? 0 : 1;

  if (aActive !== bActive) {
    return aActive - bActive;
  }

  const aPriority = PRIORITY_WEIGHT[a.priority] ?? 1;
  const bPriority = PRIORITY_WEIGHT[b.priority] ?? 1;

  if (aPriority !== bPriority) {
    return aPriority - bPriority;
  }

  const aDue = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
  const bDue = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;

  if (aDue !== bDue) {
    return aDue - bDue;
  }

  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}

function emptySnapshot(): MelusiPlanningSnapshot {
  return {
    hasMeaningfulActivity: false,
    activeProjects: [],
    pausedProjects: [],
    overdueTasks: [],
    dueSoonTasks: [],
    highPriorityTasks: [],
    projectsWithoutOpenTasks: [],
    projectNameByTaskId: {},
  };
}

function toSnapshotTask(
  task: TaskRow,
  projectName: string,
  todayLocal: string,
  dueSoonEndLocal: string,
  timeZone: string,
): MelusiPlanningSnapshotTask {
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    due_at: task.due_at,
    overdue: isTaskOverdue(task.due_at, todayLocal, timeZone),
    dueSoon: isTaskDueSoon(
      task.due_at,
      todayLocal,
      dueSoonEndLocal,
      timeZone,
    ),
    projectId: task.project_id,
    projectName,
  };
}

function limitUniqueTasks(
  tasks: MelusiPlanningSnapshotTask[],
  limit: number,
): MelusiPlanningSnapshotTask[] {
  const seen = new Set<string>();
  const result: MelusiPlanningSnapshotTask[] = [];

  for (const task of tasks) {
    if (seen.has(task.id)) {
      continue;
    }

    seen.add(task.id);
    result.push(task);

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

export function formatMelusiSnapshotForPrompt(
  snapshot: MelusiPlanningSnapshot,
): string {
  return JSON.stringify(
    {
      activeProjects: snapshot.activeProjects,
      pausedProjects: snapshot.pausedProjects,
      overdueTasks: snapshot.overdueTasks,
      dueSoonTasks: snapshot.dueSoonTasks,
      highPriorityTasks: snapshot.highPriorityTasks,
      projectsWithoutOpenTasks: snapshot.projectsWithoutOpenTasks,
    },
    null,
    2,
  );
}

export async function loadMelusiPlanningSnapshot(
  supabase: SupabaseClient,
  userId: string,
  options?: { timeZone?: string; now?: Date },
): Promise<MelusiPlanningSnapshot> {
  const lifeAreaResult = await ensureLifeAreaForModule(
    supabase,
    userId,
    "melusi",
  );

  if (!lifeAreaResult.success) {
    return emptySnapshot();
  }

  const lifeAreaId = lifeAreaResult.lifeAreaId;
  const now = options?.now ?? new Date();

  let timeZone = options?.timeZone?.trim();

  if (!timeZone || !isValidTimeZone(timeZone)) {
    const { data: profileRow } = await supabase
      .from("jarvis_profiles")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle();

    timeZone = resolveTimeZone(profileRow?.timezone ?? null);
  }

  const todayLocal = getLocalDateString(timeZone, now);
  const dueSoonEndLocal = addDaysToLocalDate(todayLocal, DUE_SOON_DAYS);

  const { data: projectRows, error: projectsError } = await supabase
    .from("projects")
    .select("id, name, status, priority, due_at, updated_at")
    .eq("user_id", userId)
    .eq("life_area_id", lifeAreaId)
    .neq("status", "archived");

  if (projectsError || !projectRows?.length) {
    return emptySnapshot();
  }

  const projects = projectRows as ProjectRow[];
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const projectIds = projects.map((project) => project.id);

  const [unfinishedResult, countsResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, priority, due_at, project_id, updated_at")
      .eq("user_id", userId)
      .eq("life_area_id", lifeAreaId)
      .in("project_id", projectIds)
      .neq("status", "done")
      .limit(MAX_UNFINISHED_TASKS),
    supabase
      .from("tasks")
      .select("id, status, project_id")
      .eq("user_id", userId)
      .eq("life_area_id", lifeAreaId)
      .in("project_id", projectIds),
  ]);

  if (unfinishedResult.error) {
    return emptySnapshot();
  }

  const unfinishedTasks = (unfinishedResult.data ?? []) as TaskRow[];
  const countRows = (countsResult.data ?? []) as TaskCountRow[];

  const taskCountsByProject = new Map<
    string,
    { total: number; completed: number; unfinished: number }
  >();

  for (const projectId of projectIds) {
    taskCountsByProject.set(projectId, {
      total: 0,
      completed: 0,
      unfinished: 0,
    });
  }

  for (const row of countRows) {
    if (!row.project_id) {
      continue;
    }

    const counts = taskCountsByProject.get(row.project_id);

    if (!counts) {
      continue;
    }

    counts.total += 1;

    if (row.status === "done") {
      counts.completed += 1;
    } else {
      counts.unfinished += 1;
    }
  }

  const sortedTasks = [...unfinishedTasks]
    .sort((a, b) =>
      compareTasksByRelevance(
        a,
        b,
        todayLocal,
        dueSoonEndLocal,
        timeZone,
      ),
    )
    .map((task) => {
      const project = projectById.get(task.project_id);

      if (!project) {
        return null;
      }

      return toSnapshotTask(
        task,
        project.name,
        todayLocal,
        dueSoonEndLocal,
        timeZone,
      );
    })
    .filter((task): task is MelusiPlanningSnapshotTask => task !== null);

  const projectNameByTaskId: Record<string, string> = {};

  for (const task of sortedTasks) {
    projectNameByTaskId[task.id] = task.projectName;
  }

  const overdueTasks = limitUniqueTasks(
    sortedTasks.filter((task) => task.overdue),
    MAX_TASKS_PER_LIST,
  );
  const dueSoonTasks = limitUniqueTasks(
    sortedTasks.filter((task) => task.dueSoon && !task.overdue),
    MAX_TASKS_PER_LIST,
  );
  const highPriorityTasks = limitUniqueTasks(
    sortedTasks.filter(
      (task) =>
        task.priority === "high" && !task.overdue && !task.dueSoon,
    ),
    MAX_TASKS_PER_LIST,
  );

  const unfinishedCountByProject = new Map<string, number>();

  for (const task of unfinishedTasks) {
    unfinishedCountByProject.set(
      task.project_id,
      (unfinishedCountByProject.get(task.project_id) ?? 0) + 1,
    );
  }

  const toSnapshotProject = (project: ProjectRow): MelusiPlanningSnapshotProject => {
    const counts = taskCountsByProject.get(project.id) ?? {
      total: 0,
      completed: 0,
      unfinished: 0,
    };

    return {
      id: project.id,
      name: project.name,
      status: project.status,
      priority: project.priority,
      due_at: project.due_at,
      taskCounts: counts,
    };
  };

  const activeProjectRows = projects
    .filter(
      (project) =>
        ACTIVE_PROJECT_STATUSES.has(project.status) &&
        project.status !== "completed",
    )
    .sort(compareProjectsByRelevance)
    .slice(0, MAX_ACTIVE_PROJECTS);

  const pausedProjectRows = projects
    .filter((project) => project.status === "paused")
    .filter((project) => {
      const unfinished = unfinishedCountByProject.get(project.id) ?? 0;

      if (unfinished === 0) {
        return false;
      }

      return sortedTasks.some(
        (task) =>
          task.projectId === project.id &&
          (task.overdue || task.dueSoon || task.priority === "high"),
      );
    })
    .sort(compareProjectsByRelevance)
    .slice(0, MAX_PAUSED_PROJECTS);

  const projectsWithoutOpenTasks = activeProjectRows
    .filter((project) => (unfinishedCountByProject.get(project.id) ?? 0) === 0)
    .map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      reason: "no_open_next_task" as const,
    }));

  const hasMeaningfulActivity =
    overdueTasks.length > 0 ||
    dueSoonTasks.length > 0 ||
    highPriorityTasks.length > 0 ||
    projectsWithoutOpenTasks.length > 0;

  return {
    hasMeaningfulActivity,
    activeProjects: activeProjectRows.map(toSnapshotProject),
    pausedProjects: pausedProjectRows.map(toSnapshotProject),
    overdueTasks,
    dueSoonTasks,
    highPriorityTasks,
    projectsWithoutOpenTasks,
    projectNameByTaskId,
  };
}
