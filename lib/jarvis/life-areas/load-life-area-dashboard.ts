import "server-only";

import {
  getLifeAreaModule,
  type LifeAreaModuleKey,
} from "@/lib/jarvis/life-areas/module-registry";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_TIMEZONE = "America/Chicago";

const PRIORITY_WEIGHT: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const PROJECT_STATUS_WEIGHT: Record<string, number> = {
  active: 0,
  idea: 1,
  paused: 2,
  completed: 3,
  archived: 4,
};

type LifeAreaRow = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
};

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  created_at: string;
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  created_at: string;
};

type GoalRow = {
  id: string;
  title: string;
  description: string | null;
  success_definition: string | null;
  status: string;
  priority: string;
  target_date: string | null;
};

type MemoryRow = {
  id: string;
  content: string;
  category: string;
  importance: number;
};

export type LifeAreaDashboardProject = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  dueAt: string | null;
};

export type LifeAreaDashboardTask = {
  id: string;
  title: string;
  priority: string;
  dueAt: string | null;
  overdue: boolean;
};

export type LifeAreaDashboardGoal = {
  id: string;
  title: string;
  description: string | null;
  successDefinition: string | null;
  priority: string;
  targetDate: string | null;
};

export type LifeAreaDashboardMemory = {
  id: string;
  content: string;
  category: string;
};

export type LifeAreaDashboardCounts = {
  activeProjects: number;
  unfinishedTasks: number;
  activeGoals: number;
  activeMemories: number;
};

export type LifeAreaDashboardData = {
  moduleKey: LifeAreaModuleKey;
  lifeArea: {
    id: string;
    name: string;
    description: string | null;
  } | null;
  projects: LifeAreaDashboardProject[];
  tasks: LifeAreaDashboardTask[];
  goals: LifeAreaDashboardGoal[];
  memories: LifeAreaDashboardMemory[];
  counts: LifeAreaDashboardCounts;
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

function compareProjects(a: ProjectRow, b: ProjectRow): number {
  const aStatus = PROJECT_STATUS_WEIGHT[a.status] ?? 99;
  const bStatus = PROJECT_STATUS_WEIGHT[b.status] ?? 99;

  if (aStatus !== bStatus) {
    return aStatus - bStatus;
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

  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function compareTasks(
  a: TaskRow,
  b: TaskRow,
  todayLocal: string,
  timeZone: string,
): number {
  const aOverdue = isTaskOverdue(a.due_at, todayLocal, timeZone);
  const bOverdue = isTaskOverdue(b.due_at, todayLocal, timeZone);

  if (aOverdue !== bOverdue) {
    return aOverdue ? -1 : 1;
  }

  const aDue = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
  const bDue = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;

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

function emptyCounts(): LifeAreaDashboardCounts {
  return {
    activeProjects: 0,
    unfinishedTasks: 0,
    activeGoals: 0,
    activeMemories: 0,
  };
}

export async function loadLifeAreaDashboard(
  supabase: SupabaseClient,
  userId: string,
  moduleKey: LifeAreaModuleKey,
): Promise<LifeAreaDashboardData> {
  const module = getLifeAreaModule(moduleKey);

  const { data: profileRow } = await supabase
    .from("jarvis_profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();

  const timezone = resolveTimeZone(profileRow?.timezone ?? null);
  const todayLocal = getLocalDateString(timezone);

  const { data: lifeAreaRow } = await supabase
    .from("life_areas")
    .select("id, name, description, active")
    .eq("user_id", userId)
    .eq("name", module.lifeAreaName)
    .maybeSingle();

  const lifeArea = (lifeAreaRow ?? null) as LifeAreaRow | null;

  if (!lifeArea?.id) {
    return {
      moduleKey,
      lifeArea: null,
      projects: [],
      tasks: [],
      goals: [],
      memories: [],
      counts: emptyCounts(),
      timezone,
    };
  }

  const lifeAreaId = lifeArea.id;

  const [projectsResult, tasksResult, goalsResult, memoriesResult] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, name, description, status, priority, due_at, created_at")
        .eq("user_id", userId)
        .eq("life_area_id", lifeAreaId),
      supabase
        .from("tasks")
        .select("id, title, status, priority, due_at, created_at")
        .eq("user_id", userId)
        .eq("life_area_id", lifeAreaId)
        .neq("status", "done"),
      supabase
        .from("goals")
        .select(
          "id, title, description, success_definition, status, priority, target_date",
        )
        .eq("user_id", userId)
        .eq("life_area_id", lifeAreaId)
        .eq("status", "active"),
      supabase
        .from("memories")
        .select("id, content, category, importance")
        .eq("user_id", userId)
        .eq("life_area_id", lifeAreaId)
        .eq("active", true)
        .order("importance", { ascending: false })
        .limit(8),
    ]);

  const projectRows = (projectsResult.data ?? []) as ProjectRow[];
  const taskRows = (tasksResult.data ?? []) as TaskRow[];
  const goalRows = (goalsResult.data ?? []) as GoalRow[];
  const memoryRows = (memoriesResult.data ?? []) as MemoryRow[];

  const projects: LifeAreaDashboardProject[] = [...projectRows]
    .sort(compareProjects)
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      priority: row.priority,
      dueAt: row.due_at,
    }));

  const tasks: LifeAreaDashboardTask[] = [...taskRows]
    .sort((a, b) => compareTasks(a, b, todayLocal, timezone))
    .map((row) => ({
      id: row.id,
      title: row.title,
      priority: row.priority,
      dueAt: row.due_at,
      overdue: isTaskOverdue(row.due_at, todayLocal, timezone),
    }));

  const goals: LifeAreaDashboardGoal[] = goalRows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    successDefinition: row.success_definition,
    priority: row.priority,
    targetDate: row.target_date,
  }));

  const memories: LifeAreaDashboardMemory[] = memoryRows.map((row) => ({
    id: row.id,
    content: row.content,
    category: row.category,
  }));

  const activeProjects = projectRows.filter(
    (project) => project.status !== "completed" && project.status !== "archived",
  ).length;

  return {
    moduleKey,
    lifeArea: {
      id: lifeArea.id,
      name: lifeArea.name,
      description: lifeArea.description,
    },
    projects,
    tasks,
    goals,
    memories,
    counts: {
      activeProjects,
      unfinishedTasks: taskRows.length,
      activeGoals: goalRows.length,
      activeMemories: memoryRows.length,
    },
    timezone,
  };
}
