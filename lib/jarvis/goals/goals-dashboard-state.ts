import type { GoalView, GoalsPageCounts } from "./types";

export type GoalsFilterTab = "all" | "priority" | "completed";

export type GoalsFilterCounts = {
  all: number;
  priority: number;
  completed: number;
};

export function buildFilterCounts(counts: GoalsPageCounts): GoalsFilterCounts {
  return {
    all: counts.active,
    priority: counts.priority,
    completed: counts.completed,
  };
}

export function filterGoalsForTab(
  goals: GoalView[],
  filter: GoalsFilterTab,
  priorityGoalId: string | null,
): GoalView[] {
  switch (filter) {
    case "all":
      return goals.filter((goal) => goal.status !== "completed");
    case "priority": {
      if (priorityGoalId === null) {
        return [];
      }

      const priorityGoal = goals.find(
        (goal) => goal.id === priorityGoalId && goal.status === "active",
      );

      return priorityGoal ? [priorityGoal] : [];
    }
    case "completed":
      return goals.filter((goal) => goal.status === "completed");
    default:
      return goals.filter((goal) => goal.status !== "completed");
  }
}

export function resolveDefaultSelectedGoalId(
  filteredGoals: GoalView[],
  priorityGoalId: string | null,
  filter: GoalsFilterTab,
): string | null {
  if (filteredGoals.length === 0) {
    return null;
  }

  if (filter === "all" || filter === "priority") {
    const priorityGoal = filteredGoals.find(
      (goal) => goal.id === priorityGoalId && goal.isCurrentPriority,
    );

    if (priorityGoal) {
      return priorityGoal.id;
    }
  }

  return filteredGoals[0]?.id ?? null;
}

export function resolveSelectedGoalId(
  currentSelectedId: string | null,
  filteredGoals: GoalView[],
  priorityGoalId: string | null,
  filter: GoalsFilterTab,
): string | null {
  if (filteredGoals.length === 0) {
    return null;
  }

  if (
    currentSelectedId !== null &&
    filteredGoals.some((goal) => goal.id === currentSelectedId)
  ) {
    return currentSelectedId;
  }

  return resolveDefaultSelectedGoalId(filteredGoals, priorityGoalId, filter);
}

export function findGoalById(
  goals: GoalView[],
  goalId: string | null,
): GoalView | null {
  if (goalId === null) {
    return null;
  }

  return goals.find((goal) => goal.id === goalId) ?? null;
}
