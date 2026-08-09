import type {
  GoalLevelView,
  GoalTaskView,
  JarvisGoalStatus,
  LevelState,
} from "./types";

export type RawGoalTask = {
  id: string;
  title: string;
  status: string;
  position: number | null;
  notes: string | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  goal_level_id: string | null;
};

export type RawGoalLevel = {
  id: string;
  name: string;
  position: number;
  goal_id: string;
};

export function isTaskDone(status: string): boolean {
  return status === "done";
}

export function isTaskBlocked(blockedAt: string | null): boolean {
  return blockedAt !== null;
}

export function sortLevelsByPosition<T extends { position: number }>(levels: T[]): T[] {
  return [...levels].sort((left, right) => left.position - right.position);
}

export function sortTasksByPosition(tasks: RawGoalTask[]): RawGoalTask[] {
  return [...tasks].sort((left, right) => {
    const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER;
    const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER;

    if (leftPosition !== rightPosition) {
      return leftPosition - rightPosition;
    }

    return left.title.localeCompare(right.title);
  });
}

export function isLevelComplete(tasks: RawGoalTask[]): boolean {
  if (tasks.length === 0) {
    return true;
  }

  return tasks.every((task) => isTaskDone(task.status));
}

export function deriveLevelStates(
  levels: RawGoalLevel[],
  tasksByLevelId: Map<string, RawGoalTask[]>,
): Map<string, LevelState> {
  const sortedLevels = sortLevelsByPosition(levels);
  const states = new Map<string, LevelState>();
  let currentAssigned = false;

  for (const level of sortedLevels) {
    const levelTasks = tasksByLevelId.get(level.id) ?? [];

    if (!currentAssigned && !isLevelComplete(levelTasks)) {
      states.set(level.id, "current");
      currentAssigned = true;
      continue;
    }

    if (!currentAssigned) {
      states.set(level.id, "complete");
      continue;
    }

    states.set(level.id, "locked");
  }

  return states;
}

export function computeGoalProgressPercent(
  levels: RawGoalLevel[],
  tasksByLevelId: Map<string, RawGoalTask[]>,
): number {
  const sortedLevels = sortLevelsByPosition(levels);

  if (sortedLevels.length === 0) {
    return 0;
  }

  const levelStates = deriveLevelStates(sortedLevels, tasksByLevelId);
  let completedLevels = 0;
  let currentLevelFraction = 0;

  for (const level of sortedLevels) {
    const state = levelStates.get(level.id);
    const levelTasks = tasksByLevelId.get(level.id) ?? [];

    if (state === "complete") {
      completedLevels += 1;
      continue;
    }

    if (state === "current") {
      if (levelTasks.length === 0) {
        currentLevelFraction = 0;
      } else {
        const doneCount = levelTasks.filter((task) => isTaskDone(task.status)).length;
        currentLevelFraction = doneCount / levelTasks.length;
      }
      break;
    }
  }

  if (completedLevels === sortedLevels.length) {
    return 100;
  }

  return Math.round(
    ((completedLevels + currentLevelFraction) / sortedLevels.length) * 100,
  );
}

export function buildGoalTaskView(
  task: RawGoalTask,
  levelState: LevelState,
): GoalTaskView {
  const done = isTaskDone(task.status);
  const blocked = isTaskBlocked(task.blocked_at);

  return {
    id: task.id,
    title: task.title,
    status: task.status as GoalTaskView["status"],
    position: task.position,
    notes: task.notes,
    blockedAt: task.blocked_at,
    blockedReason: task.blocked_reason,
    isBlocked: blocked,
    isDone: done,
    isActionable: levelState === "current" && !done,
  };
}

export function buildGoalLevelViews(
  levels: RawGoalLevel[],
  tasksByLevelId: Map<string, RawGoalTask[]>,
): GoalLevelView[] {
  const sortedLevels = sortLevelsByPosition(levels);
  const levelStates = deriveLevelStates(sortedLevels, tasksByLevelId);

  return sortedLevels.map((level) => {
    const levelTasks = sortTasksByPosition(tasksByLevelId.get(level.id) ?? []);
    const state = levelStates.get(level.id) ?? "locked";

    return {
      id: level.id,
      name: level.name,
      position: level.position,
      state,
      tasks: levelTasks.map((task) => buildGoalTaskView(task, state)),
    };
  });
}

export function isGoalFullyComplete(
  status: JarvisGoalStatus,
  levels: RawGoalLevel[],
  tasksByLevelId: Map<string, RawGoalTask[]>,
): boolean {
  if (status === "completed") {
    return true;
  }

  if (levels.length === 0) {
    return false;
  }

  return computeGoalProgressPercent(levels, tasksByLevelId) === 100;
}

export function filterGoalsByDomain<T extends { domain: string }>(
  goals: T[],
  domain: "personal" | "melusi",
): T[] {
  return goals.filter((goal) => goal.domain === domain);
}
