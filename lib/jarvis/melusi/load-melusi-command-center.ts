import "server-only";

import { loadLifeAreaDashboard } from "@/lib/jarvis/life-areas/load-life-area-dashboard";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_TIMEZONE = "America/Chicago";
const MAX_TASKS = 6;
const MAX_APPROVALS = 3;
const MAX_UPDATES = 8;
const MAX_RECOMMENDATIONS = 5;

type ActionRequestRow = {
  id: string;
  title: string;
  summary: string;
  created_at: string;
};

type ProjectUpdateRow = {
  id: string;
  project_id: string;
  update_type: string;
  content: string;
  created_at: string;
  projects: { name: string }[] | null;
};

type ProjectRow = {
  id: string;
  name: string;
  status: string;
  priority: string;
  due_at: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  priority: string;
  due_at: string | null;
  status: string;
};

export type MelusiCommandCenterTask = {
  id: string;
  title: string;
  priority: string;
  dueAt: string | null;
  overdue: boolean;
};

export type MelusiCommandCenterApproval = {
  id: string;
  title: string;
  summary: string;
};

export type MelusiCommandCenterActivity = {
  id: string;
  projectName: string;
  updateType: string;
  content: string;
  createdAt: string;
};

export type MelusiCommandCenterAlert = {
  id: string;
  kind: "blocker" | "overdue" | "approval";
  title: string;
  detail: string;
};

export type MelusiCommandCenterRecommendation = {
  id: string;
  kind: "deterministic" | "recorded";
  title: string;
  detail: string;
};

export type MelusiCommandCenterData = {
  preferredName: string;
  timezone: string;
  todayDate: string;
  todayDateLabel: string;
  counts: {
    activeProjects: number;
    unfinishedTasks: number;
    overdueTasks: number;
    pendingApprovals: number;
    blockers: number;
  };
  tasks: MelusiCommandCenterTask[];
  approvals: MelusiCommandCenterApproval[];
  alerts: MelusiCommandCenterAlert[];
  recommendations: MelusiCommandCenterRecommendation[];
  recentActivity: MelusiCommandCenterActivity[];
  projects: Array<{
    id: string;
    name: string;
    status: string;
    priority: string;
    dueAt: string | null;
  }>;
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

function formatTodayLabel(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now);
}

export async function loadMelusiCommandCenter(
  supabase: SupabaseClient,
  userId: string,
): Promise<MelusiCommandCenterData> {
  const [{ data: profileRow }, dashboard] = await Promise.all([
    supabase
      .from("jarvis_profiles")
      .select("preferred_name, timezone")
      .eq("user_id", userId)
      .maybeSingle(),
    loadLifeAreaDashboard(supabase, userId, "melusi"),
  ]);

  const timezone = resolveTimeZone(profileRow?.timezone ?? null);
  const todayLocal = getLocalDateString(timezone);
  const preferredName = profileRow?.preferred_name?.trim() || "Parker";
  const lifeAreaId = dashboard.lifeArea?.id ?? null;

  let approvals: MelusiCommandCenterApproval[] = [];
  let projectUpdates: MelusiCommandCenterActivity[] = [];
  let allMelusiTasks: TaskRow[] = [];
  let projectRows: ProjectRow[] = [];

  if (lifeAreaId) {
    const [approvalsResult, updatesResult, tasksResult, projectsResult] =
      await Promise.all([
        supabase
          .from("action_requests")
          .select("id, title, summary, created_at")
          .eq("user_id", userId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(MAX_APPROVALS),
        supabase
          .from("project_updates")
          .select(
            "id, project_id, update_type, content, created_at, projects(name)",
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(MAX_UPDATES),
        supabase
          .from("tasks")
          .select("id, title, priority, due_at, status")
          .eq("user_id", userId)
          .eq("life_area_id", lifeAreaId)
          .neq("status", "done"),
        supabase
          .from("projects")
          .select("id, name, status, priority, due_at")
          .eq("user_id", userId)
          .eq("life_area_id", lifeAreaId),
      ]);

    approvals = ((approvalsResult.data ?? []) as ActionRequestRow[]).map(
      (row) => ({
        id: row.id,
        title: row.title,
        summary: row.summary,
      }),
    );

    projectUpdates = ((updatesResult.data ?? []) as ProjectUpdateRow[]).map(
      (row) => ({
        id: row.id,
        projectName: row.projects?.[0]?.name ?? "Project",
        updateType: row.update_type,
        content: row.content,
        createdAt: row.created_at,
      }),
    );

    allMelusiTasks = (tasksResult.data ?? []) as TaskRow[];
    projectRows = (projectsResult.data ?? []) as ProjectRow[];
  }

  const overdueTasks = allMelusiTasks.filter((task) =>
    isTaskOverdue(task.due_at, todayLocal, timezone),
  );

  const priorityTasks: MelusiCommandCenterTask[] = allMelusiTasks
    .sort((a, b) => {
      const aOverdue = isTaskOverdue(a.due_at, todayLocal, timezone);
      const bOverdue = isTaskOverdue(b.due_at, todayLocal, timezone);
      if (aOverdue !== bOverdue) {
        return aOverdue ? -1 : 1;
      }
      const aDue = a.due_at
        ? new Date(a.due_at).getTime()
        : Number.POSITIVE_INFINITY;
      const bDue = b.due_at
        ? new Date(b.due_at).getTime()
        : Number.POSITIVE_INFINITY;
      return aDue - bDue;
    })
    .slice(0, MAX_TASKS)
    .map((task) => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      dueAt: task.due_at,
      overdue: isTaskOverdue(task.due_at, todayLocal, timezone),
    }));

  const blockers = projectUpdates.filter(
    (update) => update.updateType === "blocker",
  );

  const alerts: MelusiCommandCenterAlert[] = [];

  for (const blocker of blockers.slice(0, 3)) {
    alerts.push({
      id: `blocker-${blocker.id}`,
      kind: "blocker",
      title: `Blocker on ${blocker.projectName}`,
      detail: blocker.content,
    });
  }

  for (const task of overdueTasks.slice(0, 3)) {
    alerts.push({
      id: `overdue-${task.id}`,
      kind: "overdue",
      title: "Overdue Melusi task",
      detail: task.title,
    });
  }

  for (const approval of approvals) {
    alerts.push({
      id: `approval-${approval.id}`,
      kind: "approval",
      title: approval.title,
      detail: approval.summary,
    });
  }

  const recommendations: MelusiCommandCenterRecommendation[] = [];

  if (overdueTasks.length > 0) {
    recommendations.push({
      id: "rec-overdue",
      kind: "deterministic",
      title: "Clear overdue Melusi tasks",
      detail: `${overdueTasks.length} Melusi task${overdueTasks.length === 1 ? "" : "s"} ${overdueTasks.length === 1 ? "is" : "are"} past due.`,
    });
  }

  if (blockers.length > 0) {
    recommendations.push({
      id: "rec-blockers",
      kind: "recorded",
      title: "Review recorded blockers",
      detail: `${blockers.length} blocker${blockers.length === 1 ? "" : "s"} recorded across Melusi projects.`,
    });
  }

  const activeProjects = projectRows.filter(
    (project) => project.status === "active",
  );

  if (activeProjects.length > 0 && priorityTasks.length > 0) {
    recommendations.push({
      id: "rec-priorities",
      kind: "deterministic",
      title: "Focus on active project tasks",
      detail: `${activeProjects.length} active project${activeProjects.length === 1 ? "" : "s"} with ${dashboard.counts.unfinishedTasks} open Melusi task${dashboard.counts.unfinishedTasks === 1 ? "" : "s"}.`,
    });
  }

  if (approvals.length > 0) {
    recommendations.push({
      id: "rec-approvals",
      kind: "deterministic",
      title: "Review pending approvals",
      detail: `${approvals.length} approval${approvals.length === 1 ? "" : "s"} waiting for review.`,
    });
  }

  if (recommendations.length === 0 && dashboard.projects.length === 0) {
    recommendations.push({
      id: "rec-start",
      kind: "deterministic",
      title: "Create your first Melusi project",
      detail: "Add a project below to start tracking business work.",
    });
  }

  return {
    preferredName,
    timezone,
    todayDate: todayLocal,
    todayDateLabel: formatTodayLabel(timezone),
    counts: {
      activeProjects: dashboard.counts.activeProjects,
      unfinishedTasks: dashboard.counts.unfinishedTasks,
      overdueTasks: overdueTasks.length,
      pendingApprovals: approvals.length,
      blockers: blockers.length,
    },
    tasks: priorityTasks,
    approvals,
    alerts: alerts.slice(0, 6),
    recommendations: recommendations.slice(0, MAX_RECOMMENDATIONS),
    recentActivity: projectUpdates,
    projects: dashboard.projects.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      priority: project.priority,
      dueAt: project.dueAt,
    })),
  };
}
