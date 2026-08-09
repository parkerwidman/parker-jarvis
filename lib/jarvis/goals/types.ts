export type JarvisGoalType = "short_term" | "three_month" | "long_term";

export type JarvisGoalDomain = "personal" | "melusi";

export type JarvisGoalStatus = "active" | "completed" | "archived";

export type JarvisTaskStatus = "todo" | "in_progress" | "done";

export type LevelState = "complete" | "current" | "locked";

export type GoalTaskView = {
  id: string;
  title: string;
  status: JarvisTaskStatus;
  position: number | null;
  notes: string | null;
  blockedAt: string | null;
  blockedReason: string | null;
  isBlocked: boolean;
  isDone: boolean;
  isActionable: boolean;
};

export type GoalLevelView = {
  id: string;
  name: string;
  position: number;
  state: LevelState;
  tasks: GoalTaskView[];
};

export type GoalView = {
  id: string;
  title: string;
  description: string | null;
  domain: JarvisGoalDomain;
  status: JarvisGoalStatus;
  sortOrder: number;
  completedAt: string | null;
  progressPercent: number;
  levels: GoalLevelView[];
  isTodayPriority: boolean;
};

export type GoalsPageData = {
  goalType: JarvisGoalType;
  todayPriorityGoalId: string | null;
  goals: GoalView[];
};

export type GoalPageConfig = {
  goalType: JarvisGoalType;
  title: string;
  subtitle: string;
  route: string;
  showTodayPriority: boolean;
  emptyDomainLabel: (domain: JarvisGoalDomain) => string;
};

export const GOAL_PAGE_CONFIG: Record<JarvisGoalType, GoalPageConfig> = {
  short_term: {
    goalType: "short_term",
    title: "Short Term Goals",
    subtitle: "What you're focused on right now.",
    route: "/goals/short-term",
    showTodayPriority: true,
    emptyDomainLabel: (domain) =>
      `No ${domain === "personal" ? "Personal" : "Melusi"} short term goals yet.`,
  },
  three_month: {
    goalType: "three_month",
    title: "3 Month Goals",
    subtitle: "Quarter-scale outcomes you're building toward.",
    route: "/goals/three-month",
    showTodayPriority: false,
    emptyDomainLabel: (domain) =>
      `No ${domain === "personal" ? "Personal" : "Melusi"} 3 month goals yet.`,
  },
  long_term: {
    goalType: "long_term",
    title: "Long Term Goals",
    subtitle: "The bigger picture you're working toward.",
    route: "/goals/long-term",
    showTodayPriority: false,
    emptyDomainLabel: (domain) =>
      `No ${domain === "personal" ? "Personal" : "Melusi"} long term goals yet.`,
  },
};

export function domainLabel(domain: JarvisGoalDomain): string {
  return domain === "personal" ? "Personal" : "Melusi";
}
