import type { CommandCenterData } from "@/lib/jarvis/dashboard/load-command-center";

type InsightInput = {
  completedTodayCount: number;
  openTaskCount: number;
  todayEventCount: number;
  overdueTasks: number;
  pendingApprovals: number;
  primaryGoalTitle: string | null;
  primaryGoalProgress: number | null;
};

export function buildCommandCenterInsightInput(
  data: CommandCenterData,
  openTaskCount: number,
  todayEventCount: number,
): InsightInput {
  const primaryGoal = data.goalItems[0] ?? null;

  return {
    completedTodayCount: data.taskGroups.completedTodayCount,
    openTaskCount,
    todayEventCount,
    overdueTasks: data.counts.overdueTasks,
    pendingApprovals: data.counts.pendingApprovals,
    primaryGoalTitle: primaryGoal?.title ?? null,
    primaryGoalProgress: primaryGoal?.progress ?? null,
  };
}

export function buildCommandCenterInsight(input: InsightInput): string {
  const parts: string[] = [];

  if (input.completedTodayCount > 0) {
    parts.push(
      `You've completed ${input.completedTodayCount} task${input.completedTodayCount === 1 ? "" : "s"} today`,
    );
  }

  if (input.overdueTasks > 0) {
    parts.push(
      `${input.overdueTasks} overdue task${input.overdueTasks === 1 ? "" : "s"} need attention`,
    );
  } else if (input.openTaskCount > 0) {
    parts.push(
      `${input.openTaskCount} open task${input.openTaskCount === 1 ? "" : "s"} on your board`,
    );
  }

  if (input.todayEventCount > 0) {
    parts.push(
      `${input.todayEventCount} event${input.todayEventCount === 1 ? "" : "s"} on today's calendar`,
    );
  }

  if (
    input.primaryGoalTitle &&
    input.primaryGoalProgress !== null &&
    input.primaryGoalProgress > 0
  ) {
    parts.push(
      `${input.primaryGoalTitle} is ${input.primaryGoalProgress}% complete`,
    );
  }

  if (input.pendingApprovals > 0) {
    parts.push(
      `${input.pendingApprovals} approval${input.pendingApprovals === 1 ? "" : "s"} waiting for review`,
    );
  }

  if (parts.length === 0) {
    return "Your dashboard is clear. Pick a priority and start a focus block when you're ready.";
  }

  return `${parts.slice(0, 3).join(". ")}.`;
}

export function buildJarvisStatusLabel(input: {
  overdueTasks: number;
  pendingApprovals: number;
  needsReconnect: boolean;
}): { headline: string; detail: string } {
  if (input.needsReconnect) {
    return {
      headline: "Reconnect needed",
      detail: "Microsoft 365 connection requires attention.",
    };
  }

  if (input.overdueTasks > 0) {
    return {
      headline: "Needs attention",
      detail: `${input.overdueTasks} overdue task${input.overdueTasks === 1 ? "" : "s"}.`,
    };
  }

  if (input.pendingApprovals > 0) {
    return {
      headline: "Review pending",
      detail: `${input.pendingApprovals} approval${input.pendingApprovals === 1 ? "" : "s"} waiting.`,
    };
  }

  return {
    headline: "Systems Ready",
    detail: "Jarvis Online",
  };
}
