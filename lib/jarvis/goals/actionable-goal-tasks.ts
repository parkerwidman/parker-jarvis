import {
  deriveLevelStates,
  isTaskBlocked,
  isTaskDone,
  sortLevelsByPosition,
  type RawGoalLevel,
  type RawGoalTask,
} from "./goal-roadmap";
import type { JarvisGoalStatus, JarvisGoalType } from "./types";

export type ActionableGoalTaskContext = {
  goalId: string;
  goalTitle: string;
  levelId: string;
  levelTitle: string;
  isTodayPriority: boolean;
};

export type PlanningGoalRecord = {
  id: string;
  title: string;
  goal_type: JarvisGoalType | string;
  status: JarvisGoalStatus | string;
};

export type PlanningGoalLevelRecord = {
  id: string;
  name: string;
  position: number;
  goal_id: string;
};

export type PlanningGoalTaskRecord = {
  id: string;
  title: string;
  status: string;
  goal_id: string | null;
  goal_level_id: string | null;
  blocked_at: string | null;
  position?: number | null;
};

export function isStandalonePlanningTask(task: { goal_id: string | null }): boolean {
  return task.goal_id === null;
}

function groupLevelsByGoalId(
  levels: PlanningGoalLevelRecord[],
): Map<string, PlanningGoalLevelRecord[]> {
  const grouped = new Map<string, PlanningGoalLevelRecord[]>();

  for (const level of levels) {
    const existing = grouped.get(level.goal_id) ?? [];
    existing.push(level);
    grouped.set(level.goal_id, existing);
  }

  return grouped;
}

function groupTasksByGoalId(
  tasks: PlanningGoalTaskRecord[],
): Map<string, PlanningGoalTaskRecord[]> {
  const grouped = new Map<string, PlanningGoalTaskRecord[]>();

  for (const task of tasks) {
    if (task.goal_id === null) {
      continue;
    }

    const existing = grouped.get(task.goal_id) ?? [];
    existing.push(task);
    grouped.set(task.goal_id, existing);
  }

  return grouped;
}

function toRawGoalTask(task: PlanningGoalTaskRecord): RawGoalTask {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    position: task.position ?? null,
    notes: null,
    blocked_at: task.blocked_at,
    blocked_reason: null,
    goal_level_id: task.goal_level_id,
  };
}

function findCurrentLevelId(
  levels: PlanningGoalLevelRecord[],
  tasksByLevelId: Map<string, RawGoalTask[]>,
): string | null {
  const sortedLevels = sortLevelsByPosition(levels);
  const levelStates = deriveLevelStates(sortedLevels, tasksByLevelId);

  for (const level of sortedLevels) {
    if (levelStates.get(level.id) === "current") {
      return level.id;
    }
  }

  return null;
}

export function buildActionableGoalTaskIndex(input: {
  goals: PlanningGoalRecord[];
  levels: PlanningGoalLevelRecord[];
  goalTasks: PlanningGoalTaskRecord[];
  todayPriorityGoalId: string | null;
}): Map<string, ActionableGoalTaskContext> {
  const index = new Map<string, ActionableGoalTaskContext>();
  const levelsByGoalId = groupLevelsByGoalId(input.levels);
  const tasksByGoalId = groupTasksByGoalId(input.goalTasks);

  for (const goal of input.goals) {
    if (goal.status !== "active" || goal.goal_type !== "short_term") {
      continue;
    }

    const goalLevels = levelsByGoalId.get(goal.id) ?? [];
    const goalTasks = tasksByGoalId.get(goal.id) ?? [];

    const tasksByLevelId = new Map<string, RawGoalTask[]>();

    for (const task of goalTasks) {
      if (task.goal_level_id === null) {
        continue;
      }

      const existing = tasksByLevelId.get(task.goal_level_id) ?? [];
      existing.push(toRawGoalTask(task));
      tasksByLevelId.set(task.goal_level_id, existing);
    }

    const currentLevelId = findCurrentLevelId(goalLevels, tasksByLevelId);

    if (currentLevelId === null) {
      continue;
    }

    const currentLevel = goalLevels.find((level) => level.id === currentLevelId);

    if (!currentLevel) {
      continue;
    }

    const currentLevelTasks = tasksByLevelId.get(currentLevelId) ?? [];

    for (const task of currentLevelTasks) {
      if (isTaskDone(task.status) || isTaskBlocked(task.blocked_at)) {
        continue;
      }

      index.set(task.id, {
        goalId: goal.id,
        goalTitle: goal.title,
        levelId: currentLevel.id,
        levelTitle: currentLevel.name,
        isTodayPriority: input.todayPriorityGoalId === goal.id,
      });
    }
  }

  return index;
}

export function isActionableGoalPlanningTask(
  task: PlanningGoalTaskRecord,
  actionableIndex: Map<string, ActionableGoalTaskContext>,
): boolean {
  if (task.goal_id === null) {
    return false;
  }

  return actionableIndex.has(task.id);
}

export function filterUnfinishedPlanningTasks<T extends PlanningGoalTaskRecord>(
  tasks: T[],
  actionableIndex: Map<string, ActionableGoalTaskContext>,
): T[] {
  return tasks.filter((task) => {
    if (isTaskDone(task.status)) {
      return false;
    }

    if (isStandalonePlanningTask(task)) {
      return true;
    }

    return actionableIndex.has(task.id);
  });
}

export function getActionableGoalTaskContext(
  taskId: string,
  actionableIndex: Map<string, ActionableGoalTaskContext>,
): ActionableGoalTaskContext | null {
  return actionableIndex.get(taskId) ?? null;
}

export function isKanbanUnfinishedCandidate(
  task: PlanningGoalTaskRecord,
  actionableIndex: Map<string, ActionableGoalTaskContext>,
): boolean {
  if (isTaskDone(task.status)) {
    return true;
  }

  if (isStandalonePlanningTask(task)) {
    return true;
  }

  return actionableIndex.has(task.id);
}
