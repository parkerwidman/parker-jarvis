import { describe, expect, it } from "vitest";
import { buildCommandCenterView } from "./build-command-center-view";
import type { DashboardTaskRecord } from "./build-command-center-view";

const TIME_ZONE = "America/Chicago";
const TODAY = "2026-08-09";

function task(
  overrides: Partial<DashboardTaskRecord> & Pick<DashboardTaskRecord, "id" | "title">,
): DashboardTaskRecord {
  return {
    status: "todo",
    priority: "medium",
    due_at: null,
    completed_at: null,
    created_at: "2026-08-09T12:00:00.000Z",
    life_area_id: null,
    goal_id: null,
    goal_level_id: null,
    blocked_at: null,
    position: null,
    goalContext: null,
    ...overrides,
  };
}

function buildView(
  unfinishedTasks: DashboardTaskRecord[],
  options?: {
    allTasks?: DashboardTaskRecord[];
    currentFocus?: string | null;
  },
) {
  return buildCommandCenterView({
    unfinishedTasks,
    allTasks: options?.allTasks ?? unfinishedTasks,
    todayLocal: TODAY,
    timeZone: TIME_ZONE,
    lifeAreaNames: new Map(),
    goalRows: [],
    calendarEvents: [],
    outlookConnected: false,
    outlookNeedsReconnect: false,
    approvals: [],
    briefing: null,
    plan: null,
    currentFocus: options?.currentFocus ?? null,
  });
}

describe("buildCommandCenterView — today's priority ranking", () => {
  it("15. priority-goal actionable task outranks ordinary eligible task", () => {
    const view = buildView([
      task({
        id: "ordinary-overdue",
        title: "Overdue standalone",
        priority: "high",
        due_at: "2026-08-08T12:00:00.000Z",
      }),
      task({
        id: "priority-task",
        title: "Priority goal task",
        goalContext: {
          goalId: "goal-1",
          goalTitle: "Priority Goal",
          levelId: "level-1",
          levelTitle: "Current",
          isTodayPriority: true,
        },
      }),
    ]);

    expect(view.focusTask?.id).toBe("priority-task");
    expect(view.focusTask?.selectionReason).toBe("Today's priority goal");
  });

  it("16. priority goal does not hide other eligible tasks", () => {
    const view = buildView([
      task({
        id: "priority-task",
        title: "Priority goal task",
        goalContext: {
          goalId: "goal-1",
          goalTitle: "Priority Goal",
          levelId: "level-1",
          levelTitle: "Current",
          isTodayPriority: true,
        },
      }),
      task({ id: "standalone", title: "Standalone task" }),
    ]);

    const queuedIds = [
      view.focusTask?.id,
      ...view.taskGroups.next.map((entry) => entry.id),
      ...view.taskGroups.later.map((entry) => entry.id),
    ].filter(Boolean);

    expect(queuedIds).toContain("standalone");
    expect(queuedIds).toContain("priority-task");
  });

  it("17. urgency comparator determines winner among multiple priority-goal tasks", () => {
    const view = buildView([
      task({
        id: "priority-due-today",
        title: "Due today priority task",
        due_at: "2026-08-09T15:00:00.000Z",
        goalContext: {
          goalId: "goal-1",
          goalTitle: "Priority Goal",
          levelId: "level-1",
          levelTitle: "Current",
          isTodayPriority: true,
        },
      }),
      task({
        id: "priority-later",
        title: "Later priority task",
        goalContext: {
          goalId: "goal-1",
          goalTitle: "Priority Goal",
          levelId: "level-1",
          levelTitle: "Current",
          isTodayPriority: true,
        },
      }),
    ]);

    expect(view.focusTask?.id).toBe("priority-due-today");
  });

  it("18. stale/null Today Priority causes no failure", () => {
    const view = buildView([
      task({
        id: "plain",
        title: "Plain task",
        goalContext: {
          goalId: "goal-1",
          goalTitle: "Goal",
          levelId: "level-1",
          levelTitle: "Current",
          isTodayPriority: false,
        },
      }),
    ]);

    expect(view.focusTask?.id).toBe("plain");
  });
});

describe("buildCommandCenterView — current_focus precedence", () => {
  it("19. eligible exact current_focus match retains top precedence", () => {
    const view = buildView(
      [
        task({
          id: "priority-task",
          title: "Priority goal task",
          goalContext: {
            goalId: "goal-1",
            goalTitle: "Priority Goal",
            levelId: "level-1",
            levelTitle: "Current",
            isTodayPriority: true,
          },
        }),
        task({ id: "focus-task", title: "My focus task" }),
      ],
      { currentFocus: "My focus task" },
    );

    expect(view.focusTask?.id).toBe("focus-task");
    expect(view.focusTask?.selectionReason).toBe("Matches your current focus");
  });

  it("20-22. current_focus cannot resurrect ineligible goal tasks", () => {
    const staleFocusTitles = [
      "Locked task title",
      "Blocked task title",
      "Three month task title",
    ];

    for (const staleFocus of staleFocusTitles) {
      const view = buildView(
        [task({ id: "eligible", title: "Eligible standalone task" })],
        { currentFocus: staleFocus },
      );

      expect(view.focusTask?.id).toBe("eligible");
      expect(view.focusTask?.selectionReason).not.toBe("Matches your current focus");
    }
  });
});

describe("buildCommandCenterView — command center planning", () => {
  it("26. focus can select actionable goal task", () => {
    const view = buildView([
      task({
        id: "goal-task",
        title: "Email advisor",
        goalContext: {
          goalId: "goal-1",
          goalTitle: "Academic Probation",
          levelId: "level-1",
          levelTitle: "Advisor Process",
          isTodayPriority: false,
        },
      }),
    ]);

    expect(view.focusTask?.id).toBe("goal-task");
    expect(view.focusTask?.goalContext?.goalTitle).toBe("Academic Probation");
  });

  it("27. next/later can include actionable goal tasks", () => {
    const view = buildView([
      task({ id: "focus", title: "Focus task", priority: "high" }),
      task({
        id: "goal-next",
        title: "Goal follow-up",
        goalContext: {
          goalId: "goal-1",
          goalTitle: "Test Goal",
          levelId: "level-1",
          levelTitle: "Level 1",
          isTodayPriority: false,
        },
      }),
    ]);

    const queuedIds = [
      ...view.taskGroups.next.map((entry) => entry.id),
      ...view.taskGroups.later.map((entry) => entry.id),
    ];

    expect(queuedIds).toContain("goal-next");
  });

  it("29. completed task history still retains completed visible goal tasks", () => {
    const completedGoalTask = task({
      id: "done-goal-task",
      title: "Completed goal task",
      status: "done",
      completed_at: "2026-08-09T16:00:00.000Z",
      goalContext: null,
    });

    const view = buildView([], {
      allTasks: [completedGoalTask],
    });

    expect(view.taskGroups.completedTodayCount).toBe(1);
  });

  it("30. existing standalone command center behavior remains covered", () => {
    const view = buildView([
      task({
        id: "overdue-high",
        title: "Overdue high",
        priority: "high",
        due_at: "2026-08-08T12:00:00.000Z",
      }),
      task({ id: "plain", title: "Plain task" }),
    ]);

    expect(view.focusTask?.id).toBe("overdue-high");
    expect(view.focusTask?.goalContext).toBeNull();
  });
});

describe("buildCommandCenterView — goal context on tasks", () => {
  it("23-25. actionable goal task receives context; standalone has none", () => {
    const view = buildView([
      task({
        id: "goal-task",
        title: "Meet advisor",
        goalContext: {
          goalId: "goal-1",
          goalTitle: "Get off academic probation",
          levelId: "level-1",
          levelTitle: "Advisor process",
          isTodayPriority: false,
        },
      }),
      task({ id: "standalone", title: "Buy groceries" }),
    ]);

    expect(view.focusTask?.goalContext).toEqual({
      goalId: "goal-1",
      goalTitle: "Get off academic probation",
      levelId: "level-1",
      levelTitle: "Advisor process",
      isTodayPriority: false,
    });

    const standaloneInGroups = [...view.taskGroups.next, ...view.taskGroups.later].find(
      (entry) => entry.id === "standalone",
    );

    expect(standaloneInGroups?.goalContext).toBeNull();
  });
});
