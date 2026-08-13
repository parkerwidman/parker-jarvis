import "server-only";

import type { SocialCommandCenterSummary } from "@/lib/jarvis/integrations/metricool/metricool-social-types";
import {
  formatDueDate,
  getLocalDateFromIso,
} from "@/lib/jarvis/dashboard/command-center-utils";

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

export type MelusiTaskRecord = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  created_at: string;
  project_id: string | null;
};

export type MelusiProjectRecord = {
  id: string;
  name: string;
  status: string;
  priority: string;
  due_at: string | null;
  updated_at: string;
};

export type MelusiApprovalRecord = {
  id: string;
  title: string;
  summary: string;
  riskLevel: string | null;
};

export type MelusiProjectUpdateRecord = {
  id: string;
  project_id: string;
  update_type: string;
  content: string;
  created_at: string;
};

export type MelusiBusinessTask = {
  id: string;
  title: string;
  priority: string;
  dueAt: string | null;
  overdue: boolean;
  dueToday: boolean;
  projectId: string | null;
  projectName: string | null;
};

export type MelusiBusinessPriority =
  | (MelusiBusinessTask & {
      kind: "task";
      selectionReason: string;
      nextAction: string;
    })
  | {
      kind: "project-planning";
      projectId: string;
      projectName: string;
      selectionReason: string;
      nextAction: string;
    }
  | null;

export type MelusiTaskGroups = {
  next: MelusiBusinessTask[];
  later: MelusiBusinessTask[];
  additionalOverdueCount: number;
};

export type MelusiSnapshotItem = {
  id: string;
  label: string;
  value: string;
  href?: string;
  tone?: "neutral" | "warning" | "urgent";
};

export type MelusiKpiItem = {
  id: string;
  label: string;
  value: string;
  href?: string;
  tone?: "neutral" | "warning" | "urgent";
};

export type MelusiActiveProject = {
  id: string;
  name: string;
  statusLabel: string;
  openTaskCount: number;
  overdueTaskCount: number;
  latestUpdateLabel: string | null;
  nextAction: string | null;
};

export type MelusiAttentionSeverity =
  | "urgent"
  | "warning"
  | "opportunity"
  | "informational";

export type MelusiAttentionItem = {
  id: string;
  severity: MelusiAttentionSeverity;
  message: string;
  href: string | null;
};

function isTaskOverdue(
  task: MelusiTaskRecord,
  todayLocal: string,
  timeZone: string,
): boolean {
  if (!task.due_at) {
    return false;
  }

  return getLocalDateFromIso(task.due_at, timeZone) < todayLocal;
}

function isTaskDueToday(
  task: MelusiTaskRecord,
  todayLocal: string,
  timeZone: string,
): boolean {
  if (!task.due_at) {
    return false;
  }

  return getLocalDateFromIso(task.due_at, timeZone) === todayLocal;
}

function compareMelusiTasks(
  a: MelusiTaskRecord,
  b: MelusiTaskRecord,
  todayLocal: string,
  timeZone: string,
): number {
  const aOverdue = isTaskOverdue(a, todayLocal, timeZone);
  const bOverdue = isTaskOverdue(b, todayLocal, timeZone);

  if (aOverdue !== bOverdue) {
    return aOverdue ? -1 : 1;
  }

  const aDueToday = isTaskDueToday(a, todayLocal, timeZone);
  const bDueToday = isTaskDueToday(b, todayLocal, timeZone);

  if (aDueToday !== bDueToday) {
    return aDueToday ? -1 : 1;
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

function toBusinessTask(
  task: MelusiTaskRecord,
  todayLocal: string,
  timeZone: string,
  projectNames: Map<string, string>,
): MelusiBusinessTask {
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    dueAt: task.due_at,
    overdue: isTaskOverdue(task, todayLocal, timeZone),
    dueToday: isTaskDueToday(task, todayLocal, timeZone),
    projectId: task.project_id,
    projectName: task.project_id
      ? (projectNames.get(task.project_id) ?? null)
      : null,
  };
}

function getPrioritySelectionReason(
  task: MelusiTaskRecord,
  todayLocal: string,
  timeZone: string,
  linkedToActiveProject: boolean,
): string {
  if (isTaskOverdue(task, todayLocal, timeZone) && task.priority === "high") {
    return "Overdue high-priority task";
  }

  if (isTaskOverdue(task, todayLocal, timeZone)) {
    return "Overdue task";
  }

  if (isTaskDueToday(task, todayLocal, timeZone)) {
    return "Due today with highest priority";
  }

  if (linkedToActiveProject && task.priority === "high") {
    return "Highest-priority task on an active project";
  }

  if (linkedToActiveProject) {
    return "Next task on an active project";
  }

  if (task.priority === "high") {
    return "Highest-priority open task";
  }

  return "Next open Melusi task";
}

function deriveTaskNextAction(
  task: MelusiTaskRecord,
  sortedTasks: MelusiTaskRecord[],
): string {
  if (task.project_id) {
    const siblingTask = sortedTasks.find(
      (candidate) =>
        candidate.id !== task.id &&
        candidate.project_id === task.project_id &&
        candidate.title.trim().toLowerCase() !== task.title.trim().toLowerCase(),
    );

    if (siblingTask) {
      return `Then: ${siblingTask.title}`;
    }
  }

  return "Complete this task";
}

function taskToBusinessPriority(
  task: MelusiTaskRecord,
  sortedTasks: MelusiTaskRecord[],
  todayLocal: string,
  timeZone: string,
  projectNames: Map<string, string>,
  activeProjectIds: Set<string>,
): Extract<MelusiBusinessPriority, { kind: "task" }> {
  const businessTask = toBusinessTask(task, todayLocal, timeZone, projectNames);
  const linkedToActiveProject =
    task.project_id !== null && activeProjectIds.has(task.project_id);

  return {
    ...businessTask,
    kind: "task",
    selectionReason: getPrioritySelectionReason(
      task,
      todayLocal,
      timeZone,
      linkedToActiveProject,
    ),
    nextAction: deriveTaskNextAction(task, sortedTasks),
  };
}

function selectBusinessPriority(
  unfinishedTasks: MelusiTaskRecord[],
  activeProjects: MelusiProjectRecord[],
  todayLocal: string,
  timeZone: string,
  projectNames: Map<string, string>,
): MelusiBusinessPriority {
  if (unfinishedTasks.length === 0) {
    const activeWithoutTasks = activeProjects
      .filter((project) => project.status === "active")
      .sort((a, b) => {
        const aPriority = PRIORITY_WEIGHT[a.priority] ?? 1;
        const bPriority = PRIORITY_WEIGHT[b.priority] ?? 1;

        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }

        const aDue = a.due_at ?? "9999-12-31";
        const bDue = b.due_at ?? "9999-12-31";

        return aDue.localeCompare(bDue);
      });

    if (activeWithoutTasks.length > 0) {
      const project = activeWithoutTasks[0];

      return {
        kind: "project-planning",
        projectId: project.id,
        projectName: project.name,
        selectionReason: "Active project with no next action assigned",
        nextAction: "Open the project workspace and assign the next task.",
      };
    }

    return null;
  }

  const sorted = [...unfinishedTasks].sort((a, b) =>
    compareMelusiTasks(a, b, todayLocal, timeZone),
  );

  const activeProjectIds = new Set(
    activeProjects.filter((project) => project.status === "active").map((p) => p.id),
  );

  const overdueHigh = sorted.find(
    (task) => isTaskOverdue(task, todayLocal, timeZone) && task.priority === "high",
  );

  if (overdueHigh) {
    return taskToBusinessPriority(
      overdueHigh,
      sorted,
      todayLocal,
      timeZone,
      projectNames,
      activeProjectIds,
    );
  }

  const overdue = sorted.find((task) => isTaskOverdue(task, todayLocal, timeZone));

  if (overdue) {
    return taskToBusinessPriority(
      overdue,
      sorted,
      todayLocal,
      timeZone,
      projectNames,
      activeProjectIds,
    );
  }

  const dueToday = sorted.filter((task) => isTaskDueToday(task, todayLocal, timeZone));

  if (dueToday.length > 0) {
    return taskToBusinessPriority(
      dueToday[0],
      sorted,
      todayLocal,
      timeZone,
      projectNames,
      activeProjectIds,
    );
  }

  const highPriorityActiveProjectTask = sorted.find(
    (task) =>
      task.priority === "high" &&
      task.project_id !== null &&
      activeProjectIds.has(task.project_id),
  );

  if (highPriorityActiveProjectTask) {
    return taskToBusinessPriority(
      highPriorityActiveProjectTask,
      sorted,
      todayLocal,
      timeZone,
      projectNames,
      activeProjectIds,
    );
  }

  const highestPriorityActiveProject = [...activeProjects]
    .filter((project) => project.status === "active")
    .sort((a, b) => {
      const aPriority = PRIORITY_WEIGHT[a.priority] ?? 1;
      const bPriority = PRIORITY_WEIGHT[b.priority] ?? 1;

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      const aDue = a.due_at ?? "9999-12-31";
      const bDue = b.due_at ?? "9999-12-31";

      return aDue.localeCompare(bDue);
    })[0];

  if (highestPriorityActiveProject) {
    const projectTask = sorted.find(
      (task) => task.project_id === highestPriorityActiveProject.id,
    );

    if (projectTask) {
      return taskToBusinessPriority(
        projectTask,
        sorted,
        todayLocal,
        timeZone,
        projectNames,
        activeProjectIds,
      );
    }
  }

  return taskToBusinessPriority(
    sorted[0],
    sorted,
    todayLocal,
    timeZone,
    projectNames,
    activeProjectIds,
  );
}

function buildMelusiTaskGroups(
  unfinishedTasks: MelusiTaskRecord[],
  priorityTaskId: string | null,
  todayLocal: string,
  timeZone: string,
  projectNames: Map<string, string>,
): MelusiTaskGroups {
  const sorted = [...unfinishedTasks]
    .filter((task) => task.id !== priorityTaskId)
    .sort((a, b) => compareMelusiTasks(a, b, todayLocal, timeZone));

  const maxRemaining = 4;
  const overdueTasks = sorted.filter((task) => isTaskOverdue(task, todayLocal, timeZone));
  const shownOverdue = overdueTasks.slice(0, 2);
  const remainingOverdue = Math.max(0, overdueTasks.length - shownOverdue.length);

  const nonOverdueQueue = sorted.filter(
    (task) => !isTaskOverdue(task, todayLocal, timeZone),
  );

  const nextCandidates = [
    ...shownOverdue,
    ...nonOverdueQueue.filter((task) => {
      if (shownOverdue.some((overdue) => overdue.id === task.id)) {
        return false;
      }

      return (
        isTaskDueToday(task, todayLocal, timeZone) ||
        task.priority === "high" ||
        task.due_at !== null
      );
    }),
    ...nonOverdueQueue,
  ];

  const seen = new Set<string>();
  const uniqueNext: MelusiTaskRecord[] = [];

  for (const task of nextCandidates) {
    if (seen.has(task.id)) {
      continue;
    }

    seen.add(task.id);
    uniqueNext.push(task);

    if (uniqueNext.length >= Math.min(3, maxRemaining)) {
      break;
    }
  }

  const laterCandidates = sorted.filter(
    (task) => !uniqueNext.some((nextTask) => nextTask.id === task.id),
  );

  const laterLimit = Math.max(0, maxRemaining - uniqueNext.length);

  return {
    next: uniqueNext.map((task) =>
      toBusinessTask(task, todayLocal, timeZone, projectNames),
    ),
    later: laterCandidates
      .slice(0, laterLimit)
      .map((task) => toBusinessTask(task, todayLocal, timeZone, projectNames)),
    additionalOverdueCount: remainingOverdue,
  };
}

function formatRelativeUpdateDate(
  isoString: string,
  timeZone: string,
  now = new Date(),
): string {
  const updateDate = getLocalDateFromIso(isoString, timeZone);
  const todayDate = getLocalDateFromIso(now.toISOString(), timeZone);

  if (updateDate === todayDate) {
    return "Updated today";
  }

  const updateMs = new Date(isoString).getTime();
  const diffDays = Math.floor((now.getTime() - updateMs) / (1000 * 60 * 60 * 24));

  if (diffDays === 1) {
    return "Updated yesterday";
  }

  if (diffDays < 7) {
    return `Updated ${diffDays} days ago`;
  }

  return `Updated ${formatDueDate(isoString, timeZone)}`;
}

function buildActiveProjects(
  projects: MelusiProjectRecord[],
  unfinishedTasks: MelusiTaskRecord[],
  projectUpdates: MelusiProjectUpdateRecord[],
  priority: MelusiBusinessPriority,
  todayLocal: string,
  timeZone: string,
): MelusiActiveProject[] {
  const activeProjects = projects.filter((project) => project.status === "active");

  const openTaskCountByProject = new Map<string, number>();
  const overdueTaskCountByProject = new Map<string, number>();
  const nextTaskByProject = new Map<string, string>();

  for (const task of unfinishedTasks) {
    if (!task.project_id) {
      continue;
    }

    openTaskCountByProject.set(
      task.project_id,
      (openTaskCountByProject.get(task.project_id) ?? 0) + 1,
    );

    if (isTaskOverdue(task, todayLocal, timeZone)) {
      overdueTaskCountByProject.set(
        task.project_id,
        (overdueTaskCountByProject.get(task.project_id) ?? 0) + 1,
      );
    }

    if (!nextTaskByProject.has(task.project_id)) {
      nextTaskByProject.set(task.project_id, task.title);
    }
  }

  const latestUpdateByProject = new Map<string, string>();

  for (const update of projectUpdates) {
    if (!latestUpdateByProject.has(update.project_id)) {
      latestUpdateByProject.set(update.project_id, update.created_at);
    }
  }

  const priorityProjectId =
    priority?.kind === "task"
      ? priority.projectId
      : priority?.kind === "project-planning"
        ? priority.projectId
        : null;

  const scored = activeProjects.map((project) => {
    let score = 0;

    if (project.id === priorityProjectId) {
      score += 1000;
    }

    score += (3 - (PRIORITY_WEIGHT[project.priority] ?? 1)) * 100;

    if (project.due_at) {
      const daysUntilDue = Math.floor(
        (new Date(project.due_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );

      if (daysUntilDue >= 0 && daysUntilDue <= 14) {
        score += 50 - daysUntilDue;
      }
    }

    const overdueCount = overdueTaskCountByProject.get(project.id) ?? 0;

    if (overdueCount > 0) {
      score += 30;
    }

    const latestUpdate = latestUpdateByProject.get(project.id);

    if (latestUpdate) {
      score += 10;
    }

    return { project, score };
  });

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      const aStatus = PROJECT_STATUS_WEIGHT[a.project.status] ?? 9;
      const bStatus = PROJECT_STATUS_WEIGHT[b.project.status] ?? 9;

      if (aStatus !== bStatus) {
        return aStatus - bStatus;
      }

      return a.project.name.localeCompare(b.project.name);
    })
    .slice(0, 3)
    .map(({ project }) => ({
      id: project.id,
      name: project.name,
      statusLabel: "Active",
      openTaskCount: openTaskCountByProject.get(project.id) ?? 0,
      overdueTaskCount: overdueTaskCountByProject.get(project.id) ?? 0,
      latestUpdateLabel: latestUpdateByProject.has(project.id)
        ? formatRelativeUpdateDate(
            latestUpdateByProject.get(project.id)!,
            timeZone,
          )
        : null,
      nextAction: nextTaskByProject.get(project.id) ?? null,
    }));
}

function buildBusinessSnapshot(input: {
  activeProjectCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
  socialSummary: SocialCommandCenterSummary | null;
  socialConnected: boolean;
  socialStatus: string;
  latestUpdateAt: string | null;
  timeZone: string;
}): MelusiSnapshotItem[] {
  const items: MelusiSnapshotItem[] = [];

  items.push({
    id: "active-projects",
    label: "Active projects",
    value: String(input.activeProjectCount),
    href: "/melusi#active-projects",
  });

  items.push({
    id: "open-tasks",
    label: "Open tasks",
    value: String(input.openTaskCount),
    href: "/tasks",
    tone: input.overdueTaskCount > 0 ? "warning" : "neutral",
  });

  if (input.overdueTaskCount > 0) {
    items.push({
      id: "overdue-tasks",
      label: "Overdue tasks",
      value: String(input.overdueTaskCount),
      href: "/tasks",
      tone: "urgent",
    });
  }

  if (input.socialConnected && input.socialSummary) {
    const reelPace = input.socialSummary.cadenceReelPace;
    let socialValue = "Connected";

    if (reelPace === "behind") {
      socialValue = "Behind Reel target";
    } else if (reelPace === "on_pace") {
      socialValue = "Reel cadence on track";
    } else if (reelPace === "ahead") {
      socialValue = "Ahead of Reel target";
    }

    items.push({
      id: "social-cadence",
      label: "Social",
      value: socialValue,
      href: "/melusi/social",
      tone: reelPace === "behind" ? "warning" : "neutral",
    });

    if (input.socialSummary.alertCount > 0) {
      items.push({
        id: "social-alerts",
        label: "Social alerts",
        value: `${input.socialSummary.alertCount} important`,
        href: "/melusi/social",
        tone: "warning",
      });
    }
  } else if (input.socialStatus === "reconnect_required") {
    items.push({
      id: "social-reconnect",
      label: "Social",
      value: "Reconnect required",
      href: "/melusi/social",
      tone: "warning",
    });
  } else if (!input.socialConnected) {
    items.push({
      id: "social-disconnected",
      label: "Social",
      value: "Not connected",
      href: "/melusi/social",
      tone: "neutral",
    });
  }

  if (input.latestUpdateAt) {
    items.push({
      id: "latest-update",
      label: "Latest update",
      value: formatRelativeUpdateDate(input.latestUpdateAt, input.timeZone),
      tone: "neutral",
    });
  }

  return items.slice(0, 5);
}

export function buildMelusiKpiStrip(input: {
  activeProjectCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
  socialSummary: SocialCommandCenterSummary | null;
  socialConnected: boolean;
  socialStatus: string;
  latestUpdateAt: string | null;
  timeZone: string;
}): MelusiKpiItem[] {
  let socialValue = "Not connected";
  let socialTone: MelusiKpiItem["tone"] = "neutral";
  let socialHref = "/melusi/social";

  if (input.socialConnected && input.socialSummary) {
    const reelPace = input.socialSummary.cadenceReelPace;

    if (reelPace === "behind") {
      socialValue = "Behind Reel target";
      socialTone = "warning";
    } else if (reelPace === "on_pace") {
      socialValue = "Reel cadence on track";
    } else if (reelPace === "ahead") {
      socialValue = "Ahead of Reel target";
    } else {
      socialValue = "Connected";
    }
  } else if (input.socialStatus === "reconnect_required") {
    socialValue = "Reconnect required";
    socialTone = "warning";
  }

  const latestUpdateValue = input.latestUpdateAt
    ? formatRelativeUpdateDate(input.latestUpdateAt, input.timeZone)
    : "No updates yet";

  return [
    {
      id: "kpi-active-projects",
      label: "Active projects",
      value: String(input.activeProjectCount),
      href: "/melusi#active-projects",
    },
    {
      id: "kpi-open-tasks",
      label: "Open tasks",
      value: String(input.openTaskCount),
      href: "/tasks",
      tone: input.overdueTaskCount > 0 ? "warning" : "neutral",
    },
    {
      id: "kpi-social",
      label: "Social",
      value: socialValue,
      href: socialHref,
      tone: socialTone,
    },
    {
      id: "kpi-latest-update",
      label: "Latest update",
      value: latestUpdateValue,
    },
  ];
}

function buildAttentionItems(input: {
  unfinishedTasks: MelusiTaskRecord[];
  todayLocal: string;
  timeZone: string;
  activeProjects: MelusiProjectRecord[];
  approvals: MelusiApprovalRecord[];
  blockers: MelusiProjectUpdateRecord[];
  socialSummary: SocialCommandCenterSummary | null;
  socialConnected: boolean;
  socialStatus: string;
  projectUpdates: MelusiProjectUpdateRecord[];
  projects: MelusiProjectRecord[];
}): MelusiAttentionItem[] {
  const items: MelusiAttentionItem[] = [];

  const overdueHigh = input.unfinishedTasks.filter(
    (task) =>
      isTaskOverdue(task, input.todayLocal, input.timeZone) &&
      task.priority === "high",
  );

  if (overdueHigh.length > 0) {
    items.push({
      id: "overdue-high",
      severity: "urgent",
      message: `${overdueHigh.length} high-priority overdue task${overdueHigh.length === 1 ? "" : "s"}`,
      href: "/tasks",
    });
  }

  const activeProjects = input.activeProjects.filter(
    (project) => project.status === "active",
  );

  const projectsWithOpenTasks = new Set(
    input.unfinishedTasks
      .map((task) => task.project_id)
      .filter((id): id is string => id !== null),
  );

  const projectWithoutNextAction = activeProjects.find(
    (project) => !projectsWithOpenTasks.has(project.id),
  );

  if (projectWithoutNextAction) {
    items.push({
      id: `project-no-action-${projectWithoutNextAction.id}`,
      severity: "warning",
      message: `"${projectWithoutNextAction.name}" has no next action assigned`,
      href: `/melusi/projects/${projectWithoutNextAction.id}`,
    });
  }

  for (const project of activeProjects) {
    const overdueCount = input.unfinishedTasks.filter(
      (task) =>
        task.project_id === project.id &&
        isTaskOverdue(task, input.todayLocal, input.timeZone),
    ).length;

    if (overdueCount >= 2) {
      items.push({
        id: `project-overdue-${project.id}`,
        severity: "warning",
        message: `"${project.name}" has ${overdueCount} overdue tasks`,
        href: `/melusi/projects/${project.id}`,
      });
      break;
    }
  }

  if (input.socialConnected && input.socialSummary) {
    if (input.socialSummary.cadenceReelPace === "behind") {
      items.push({
        id: "social-cadence-behind",
        severity: "warning",
        message: "Social Reel cadence is behind weekly target",
        href: "/melusi/social",
      });
    }

    if (input.socialSummary.alertCount > 0) {
      items.push({
        id: "social-alerts",
        severity: "warning",
        message: `${input.socialSummary.alertCount} important Social alert${input.socialSummary.alertCount === 1 ? "" : "s"}`,
        href: "/melusi/social",
      });
    }

    if (input.socialSummary.upcomingScheduledCount === 0) {
      items.push({
        id: "social-no-scheduled",
        severity: "opportunity",
        message: "No social posts scheduled for the next seven days",
        href: "/melusi/social",
      });
    }
  }

  if (input.socialStatus === "reconnect_required") {
    items.push({
      id: "social-reconnect",
      severity: "warning",
      message: "Metricool connection needs to be renewed",
      href: "/melusi/social",
    });
  }

  const approvalRequired = input.approvals.find(
    (approval) => approval.riskLevel === "approval_required",
  );

  if (approvalRequired) {
    items.push({
      id: `approval-${approvalRequired.id}`,
      severity: "warning",
      message: `Approval waiting: ${approvalRequired.title}`,
      href: "/approvals",
    });
  } else if (input.approvals.length > 0) {
    items.push({
      id: "approvals-pending",
      severity: "informational",
      message: `${input.approvals.length} approval${input.approvals.length === 1 ? "" : "s"} waiting for review`,
      href: "/approvals",
    });
  }

  const staleThresholdMs = 14 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const project of activeProjects) {
    const updatedMs = new Date(project.updated_at).getTime();
    const hasRecentUpdate = input.projectUpdates.some(
      (update) =>
        update.project_id === project.id &&
        now - new Date(update.created_at).getTime() < staleThresholdMs,
    );

    if (now - updatedMs > staleThresholdMs && !hasRecentUpdate) {
      items.push({
        id: `stale-project-${project.id}`,
        severity: "informational",
        message: `"${project.name}" has no recent updates`,
        href: `/melusi/projects/${project.id}`,
      });
      break;
    }
  }

  for (const blocker of input.blockers.slice(0, 1)) {
    items.push({
      id: `blocker-${blocker.id}`,
      severity: "urgent",
      message: "Recorded project blocker needs review",
      href: "/melusi#active-projects",
    });
  }

  const severityOrder: Record<MelusiAttentionSeverity, number> = {
    urgent: 0,
    warning: 1,
    opportunity: 2,
    informational: 3,
  };

  const seen = new Set<string>();

  return items
    .filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }

      seen.add(item.id);
      return true;
    })
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, 3);
}

export function buildMelusiHeaderStatus(input: {
  priority: MelusiBusinessPriority;
  overdueTaskCount: number;
  socialSummary: SocialCommandCenterSummary | null;
  socialConnected: boolean;
  socialStatus: string;
}): string {
  const parts: string[] = [];

  if (input.priority?.kind === "task" && input.priority.overdue) {
    parts.push(`Top priority "${input.priority.title}" is overdue`);
  } else if (input.priority?.kind === "task") {
    parts.push(`Top priority: ${input.priority.title}`);
  } else if (input.priority?.kind === "project-planning") {
    parts.push(`"${input.priority.projectName}" needs a next action`);
  }

  if (input.overdueTaskCount > 0 && !parts.some((part) => part.includes("overdue"))) {
    parts.push(
      `${input.overdueTaskCount} overdue task${input.overdueTaskCount === 1 ? "" : "s"}`,
    );
  }

  if (
    input.socialConnected &&
    input.socialSummary?.cadenceReelPace === "behind"
  ) {
    parts.push("Social is behind the Reel target");
  } else if (input.socialStatus === "reconnect_required") {
    parts.push("Social connection needs renewal");
  } else if (!input.socialConnected && input.socialStatus === "disconnected") {
    parts.push("Social analytics not connected");
  }

  if (parts.length > 0) {
    return parts.slice(0, 2).join(" · ") + ".";
  }

  return "No urgent business issues right now.";
}

export function buildMelusiCommandCenterView(input: {
  unfinishedTasks: MelusiTaskRecord[];
  projects: MelusiProjectRecord[];
  projectUpdates: MelusiProjectUpdateRecord[];
  approvals: MelusiApprovalRecord[];
  projectNames: Map<string, string>;
  todayLocal: string;
  timeZone: string;
  activeProjectCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
  socialSummary: SocialCommandCenterSummary | null;
  socialConnected: boolean;
  socialStatus: string;
}): {
  businessPriority: MelusiBusinessPriority;
  taskGroups: MelusiTaskGroups;
  snapshotItems: MelusiSnapshotItem[];
  kpiItems: MelusiKpiItem[];
  activeProjects: MelusiActiveProject[];
  attentionItems: MelusiAttentionItem[];
  headerStatus: string;
  activeProjectCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
  socialStatus: string;
  socialConnected: boolean;
} {
  const activeProjects = input.projects.filter(
    (project) => project.status === "active",
  );

  const blockers = input.projectUpdates.filter(
    (update) => update.update_type === "blocker",
  );

  const businessPriority = selectBusinessPriority(
    input.unfinishedTasks,
    input.projects,
    input.todayLocal,
    input.timeZone,
    input.projectNames,
  );

  const priorityTaskId =
    businessPriority?.kind === "task" ? businessPriority.id : null;

  const taskGroups = buildMelusiTaskGroups(
    input.unfinishedTasks,
    priorityTaskId,
    input.todayLocal,
    input.timeZone,
    input.projectNames,
  );

  const latestUpdateAt =
    input.projectUpdates.length > 0 ? input.projectUpdates[0].created_at : null;

  const snapshotItems = buildBusinessSnapshot({
    activeProjectCount: input.activeProjectCount,
    openTaskCount: input.openTaskCount,
    overdueTaskCount: input.overdueTaskCount,
    socialSummary: input.socialSummary,
    socialConnected: input.socialConnected,
    socialStatus: input.socialStatus,
    latestUpdateAt,
    timeZone: input.timeZone,
  });

  const kpiItems = buildMelusiKpiStrip({
    activeProjectCount: input.activeProjectCount,
    openTaskCount: input.openTaskCount,
    overdueTaskCount: input.overdueTaskCount,
    socialSummary: input.socialSummary,
    socialConnected: input.socialConnected,
    socialStatus: input.socialStatus,
    latestUpdateAt,
    timeZone: input.timeZone,
  });

  const activeProjectSummaries = buildActiveProjects(
    input.projects,
    input.unfinishedTasks,
    input.projectUpdates,
    businessPriority,
    input.todayLocal,
    input.timeZone,
  );

  const attentionItems = buildAttentionItems({
    unfinishedTasks: input.unfinishedTasks,
    todayLocal: input.todayLocal,
    timeZone: input.timeZone,
    activeProjects: input.projects,
    approvals: input.approvals,
    blockers,
    socialSummary: input.socialSummary,
    socialConnected: input.socialConnected,
    socialStatus: input.socialStatus,
    projectUpdates: input.projectUpdates,
    projects: input.projects,
  });

  const headerStatus = buildMelusiHeaderStatus({
    priority: businessPriority,
    overdueTaskCount: input.overdueTaskCount,
    socialSummary: input.socialSummary,
    socialConnected: input.socialConnected,
    socialStatus: input.socialStatus,
  });

  return {
    businessPriority,
    taskGroups,
    snapshotItems,
    kpiItems,
    activeProjects: activeProjectSummaries,
    attentionItems,
    headerStatus,
    activeProjectCount: input.activeProjectCount,
    openTaskCount: input.openTaskCount,
    overdueTaskCount: input.overdueTaskCount,
    socialStatus: input.socialStatus,
    socialConnected: input.socialConnected,
  };
}
