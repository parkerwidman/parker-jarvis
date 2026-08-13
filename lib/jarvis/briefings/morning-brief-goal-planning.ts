import {
  buildActionableGoalTaskIndex,
  filterUnfinishedPlanningTasks,
  type ActionableGoalTaskContext,
  type PlanningGoalLevelRecord,
  type PlanningGoalRecord,
  type PlanningGoalTaskRecord,
} from "@/lib/jarvis/goals/actionable-goal-tasks";
import { shouldIncludeTaskInMorningBriefSelection } from "@/lib/jarvis/briefings/morning-brief-task-policy";
import type { MorningBriefTask } from "@/lib/jarvis/briefings/morning-brief-structure";

export type MorningBriefGoalRecord = PlanningGoalRecord & {
  domain: "personal" | "melusi" | string;
};

export type MorningBriefGoalSection = {
  goalId: string;
  goalTitle: string;
  levelTitle: string;
  domain: "personal" | "melusi";
  isTodayPriority: boolean;
  tasks: MorningBriefTask[];
};

export type MorningBriefPlanningContext = {
  planningTasks: MorningBriefTask[];
  todayPriorityGoal: MorningBriefGoalSection | null;
  otherActionableGoals: MorningBriefGoalSection[];
  standaloneTasks: MorningBriefTask[];
  todayPriorityGoalId: string | null;
};

export type MorningBriefRawTaskRow = PlanningGoalTaskRecord & {
  priority: string;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  life_area_id: string | null;
  notes: string | null;
  project_id: string | null;
};

export function buildMorningBriefActionableIndex(input: {
  goals: MorningBriefGoalRecord[];
  levels: PlanningGoalLevelRecord[];
  goalTasks: PlanningGoalTaskRecord[];
  todayPriorityGoalId: string | null;
}) {
  const priorityGoalIds = input.todayPriorityGoalId
    ? new Set([input.todayPriorityGoalId])
    : new Set<string>();

  return buildActionableGoalTaskIndex({
    goals: input.goals,
    levels: input.levels.filter((level) =>
      input.goals.some((goal) => goal.id === level.goal_id),
    ),
    goalTasks: input.goalTasks,
    priorityGoalIds,
  });
}

function resolveGoalDomain(domain: string): "personal" | "melusi" {
  return domain === "melusi" ? "melusi" : "personal";
}

function buildGoalSection(
  goalId: string,
  goalsById: Map<string, MorningBriefGoalRecord>,
  tasksByGoalId: Map<string, MorningBriefTask[]>,
  isTodayPriority: boolean,
): MorningBriefGoalSection | null {
  const goal = goalsById.get(goalId);
  const goalTasks = tasksByGoalId.get(goalId) ?? [];

  if (!goal || goalTasks.length === 0) {
    return null;
  }

  const goalContext = goalTasks[0].goalContext;

  if (!goalContext) {
    return null;
  }

  return {
    goalId,
    goalTitle: goalContext.goalTitle,
    levelTitle: goalContext.levelTitle,
    domain: resolveGoalDomain(goal.domain),
    isTodayPriority,
    tasks: goalTasks,
  };
}

export function buildMorningBriefPlanningContext(input: {
  planningTasks: MorningBriefTask[];
  goals: MorningBriefGoalRecord[];
  todayPriorityGoalId: string | null;
}): MorningBriefPlanningContext {
  const goalsById = new Map(input.goals.map((goal) => [goal.id, goal]));
  const standaloneTasks = input.planningTasks.filter((task) => !task.goalContext);
  const tasksByGoalId = new Map<string, MorningBriefTask[]>();

  for (const task of input.planningTasks) {
    const goalId = task.goalContext?.goalId;

    if (!goalId) {
      continue;
    }

    const existing = tasksByGoalId.get(goalId) ?? [];
    existing.push(task);
    tasksByGoalId.set(goalId, existing);
  }

  const todayPriorityGoal =
    input.todayPriorityGoalId !== null
      ? buildGoalSection(
          input.todayPriorityGoalId,
          goalsById,
          tasksByGoalId,
          true,
        )
      : null;

  const otherActionableGoals: MorningBriefGoalSection[] = [];

  for (const goal of input.goals) {
    if (goal.id === input.todayPriorityGoalId) {
      continue;
    }

    const section = buildGoalSection(goal.id, goalsById, tasksByGoalId, false);

    if (section) {
      otherActionableGoals.push(section);
    }
  }

  return {
    planningTasks: input.planningTasks,
    todayPriorityGoal,
    otherActionableGoals,
    standaloneTasks,
    todayPriorityGoalId: input.todayPriorityGoalId,
  };
}

export function filterMorningBriefPlanningTasks<T extends PlanningGoalTaskRecord>(
  tasks: T[],
  actionableIndex: Map<string, ActionableGoalTaskContext>,
): T[] {
  return filterUnfinishedPlanningTasks(tasks, actionableIndex);
}

function formatMorningBriefTaskLine(task: MorningBriefTask): string {
  const suffixes: string[] = [];

  if (task.overdue) {
    suffixes.push("overdue");
  } else if (task.dueToday) {
    suffixes.push("due today");
  }

  if (task.priority === "high") {
    suffixes.push("high priority");
  }

  const suffix = suffixes.length > 0 ? ` (${suffixes.join(", ")})` : "";

  return `- ${task.title}${suffix}`;
}

function formatGoalSection(section: MorningBriefGoalSection): string[] {
  return [
    `Goal: ${section.goalTitle}`,
    `Current level: ${section.levelTitle}`,
    "Actionable tasks:",
    ...section.tasks.map((task) => formatMorningBriefTaskLine(task)),
  ];
}

export function buildMorningBriefGoalPlanningPromptSections(
  planningContext: MorningBriefPlanningContext,
): string[] {
  const sections: string[] = [];

  if (planningContext.todayPriorityGoal) {
    sections.push("TODAY'S PRIORITY GOAL");
    sections.push(...formatGoalSection(planningContext.todayPriorityGoal));
  }

  if (planningContext.otherActionableGoals.length > 0) {
    sections.push("");
    sections.push("OTHER ACTIONABLE SHORT TERM GOALS");

    for (const goalSection of planningContext.otherActionableGoals) {
      sections.push(...formatGoalSection(goalSection));
    }
  }

  const standaloneEligible = planningContext.standaloneTasks.filter((task) =>
    shouldIncludeTaskInMorningBriefSelection(
      {
        title: task.title,
        notes: task.notes,
        lifeAreaName: task.lifeAreaName,
        projectId: task.projectId,
      },
      null,
    ),
  );

  if (standaloneEligible.length > 0) {
    sections.push("");
    sections.push("STANDALONE TASKS");
    sections.push(...standaloneEligible.map((task) => formatMorningBriefTaskLine(task)));
  }

  return sections;
}

export function collectMorningBriefPromptTaskTitles(
  planningContext: MorningBriefPlanningContext,
): string[] {
  const titles = new Set<string>();

  for (const task of planningContext.planningTasks) {
    titles.add(task.title);
  }

  return [...titles];
}
