import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDailyPlanActionableIndex,
  buildDailyPlanGoalPlanningPromptSections,
  buildDailyPlanPlanningContext,
  buildDailyPlanPriorityInstructionSection,
  buildDailyPlanTaskAllowlist,
  compareDailyPlanTasks,
  filterDailyPlanPlanningTasks,
  prepareDailyPlanTasks,
  resolveEligibleCurrentFocusTaskId,
  type DailyPlanGoalRecord,
  type DailyPlanTask,
} from "@/lib/jarvis/plans/daily-plan-goal-planning";
import {
  filterSuggestedItemsByTaskAllowlist,
  isValidSuggestedPlanItem,
} from "@/lib/jarvis/plans/generate-daily-plan";

const ROOT = resolve(import.meta.dirname, "../../..");
const GOAL_ID = "goal-short";
const LEVEL_ONE = "level-1";
const LEVEL_TWO = "level-2";
const PLAN_DATE = "2026-08-11";
const TIMEZONE = "America/Chicago";

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function goal(overrides?: Partial<DailyPlanGoalRecord>): DailyPlanGoalRecord {
  return {
    id: GOAL_ID,
    title: "Get off academic probation and get into Tippie",
    goal_type: "short_term",
    status: "active",
    domain: "personal",
    ...overrides,
  };
}

function rawTask(
  overrides: Partial<{
    id: string;
    title: string;
    status: string;
    goal_id: string | null;
    goal_level_id: string | null;
    blocked_at: string | null;
    priority: string;
    due_at: string | null;
  }> = {},
) {
  return {
    id: overrides.id ?? "task-1",
    title: overrides.title ?? "Task",
    status: overrides.status ?? "todo",
    goal_id: "goal_id" in overrides ? overrides.goal_id! : GOAL_ID,
    goal_level_id: "goal_level_id" in overrides ? overrides.goal_level_id! : LEVEL_ONE,
    blocked_at: overrides.blocked_at ?? null,
    position: 0,
    priority: overrides.priority ?? "medium",
    due_at: overrides.due_at ?? null,
    completed_at: null,
    created_at: "2026-08-11T12:00:00.000Z",
    life_area_id: null,
    project_id: null,
  };
}

function buildIndex(
  goalTasks: ReturnType<typeof rawTask>[],
  todayPriorityGoalId: string | null = GOAL_ID,
  goals: DailyPlanGoalRecord[] = [goal()],
) {
  return buildDailyPlanActionableIndex({
    goals,
    levels: [
      { id: LEVEL_ONE, name: "Advisor process", position: 1, goal_id: GOAL_ID },
      { id: LEVEL_TWO, name: "Future level", position: 2, goal_id: GOAL_ID },
    ],
    goalTasks,
    todayPriorityGoalId,
  });
}

function planTask(
  overrides: Partial<DailyPlanTask> & Pick<DailyPlanTask, "id" | "title">,
): DailyPlanTask {
  return {
    priority: "medium",
    due_at: null,
    overdue: false,
    dueToday: false,
    goalContext: null,
    ...overrides,
  };
}

function planningContextFromRaw(
  filtered: ReturnType<typeof rawTask>[],
  index: ReturnType<typeof buildIndex>,
  options?: {
    todayPriorityGoalId?: string | null;
    currentFocus?: string | null;
    goals?: DailyPlanGoalRecord[];
  },
) {
  const planningTasks = prepareDailyPlanTasks(
    filtered,
    TIMEZONE,
    PLAN_DATE,
    index,
  );

  return buildDailyPlanPlanningContext({
    planningTasks,
    goals: options?.goals ?? [goal()],
    todayPriorityGoalId: options?.todayPriorityGoalId ?? GOAL_ID,
    currentFocus: options?.currentFocus ?? null,
  });
}

function suggestedTaskItem(sourceId: string): {
  startTime: string;
  endTime: string;
  title: string;
  type: "task_block";
  source: "task";
  sourceId: string;
  isFixed: boolean;
  reason: string;
} {
  return {
    startTime: "2026-08-11T09:00:00-05:00",
    endTime: "2026-08-11T10:00:00-05:00",
    title: "Work block",
    type: "task_block",
    source: "task",
    sourceId,
    isFixed: false,
    reason: "Focus time",
  };
}

describe("Phase 1B2-H1D1 Daily Plan goal planning", () => {
  describe("actionability", () => {
    it("1. standalone unfinished task remains eligible", () => {
      const index = buildIndex([]);
      const standalone = rawTask({
        id: "solo",
        title: "Buy groceries",
        goal_id: null,
        goal_level_id: null,
      });

      expect(
        filterDailyPlanPlanningTasks([standalone], index).map((task) => task.id),
      ).toEqual(["solo"]);
    });

    it("2. actionable current-level Short Term Goal task eligible", () => {
      const index = buildIndex([
        rawTask({ id: "actionable", title: "Meet with advisor" }),
      ]);

      expect(index.has("actionable")).toBe(true);
    });

    it("3. actionable Goal task has Goal/Level context", () => {
      const index = buildIndex([
        rawTask({ id: "actionable", title: "Meet with advisor" }),
      ]);
      const prepared = prepareDailyPlanTasks(
        filterDailyPlanPlanningTasks(
          [rawTask({ id: "actionable", title: "Meet with advisor" })],
          index,
        ),
        TIMEZONE,
        PLAN_DATE,
        index,
      );

      expect(prepared[0].goalContext).toEqual({
        goalId: GOAL_ID,
        goalTitle: "Get off academic probation and get into Tippie",
        goalDomain: "personal",
        levelId: LEVEL_ONE,
        levelTitle: "Advisor process",
        isTodayPriority: true,
      });
    });

    it("4-8. ineligible goal tasks excluded", () => {
      const index = buildIndex([
        rawTask({ id: "open", title: "Open task" }),
        rawTask({ id: "locked", title: "Locked", goal_level_id: LEVEL_TWO }),
        rawTask({
          id: "blocked",
          title: "Blocked",
          blocked_at: "2026-08-11T00:00:00.000Z",
        }),
      ]);

      expect(index.has("open")).toBe(true);
      expect(index.has("locked")).toBe(false);
      expect(index.has("blocked")).toBe(false);

      const threeMonthIndex = buildDailyPlanActionableIndex({
        goals: [goal({ goal_type: "three_month" })],
        levels: [{ id: LEVEL_ONE, name: "L1", position: 1, goal_id: GOAL_ID }],
        goalTasks: [rawTask({ id: "three-month" })],
        todayPriorityGoalId: GOAL_ID,
      });
      expect(threeMonthIndex.size).toBe(0);

      const longTermIndex = buildDailyPlanActionableIndex({
        goals: [goal({ goal_type: "long_term" })],
        levels: [{ id: LEVEL_ONE, name: "L1", position: 1, goal_id: GOAL_ID }],
        goalTasks: [rawTask({ id: "long-term" })],
        todayPriorityGoalId: GOAL_ID,
      });
      expect(longTermIndex.size).toBe(0);

      const completedGoalIndex = buildDailyPlanActionableIndex({
        goals: [goal({ status: "completed" })],
        levels: [{ id: LEVEL_ONE, name: "L1", position: 1, goal_id: GOAL_ID }],
        goalTasks: [rawTask({ id: "orphan" })],
        todayPriorityGoalId: GOAL_ID,
      });
      expect(completedGoalIndex.size).toBe(0);
    });

    it("9. archived-goal task excluded through jarvis_visible_tasks boundary", () => {
      const generator = readSource("lib/jarvis/plans/daily-plan-goal-planning.ts");
      expect(generator).toContain('.from("jarvis_visible_tasks")');
      expect(generator).not.toContain('.from("tasks")');
    });

    it("10. malformed roadmap fails closed", () => {
      const malformedIndex = buildDailyPlanActionableIndex({
        goals: [goal()],
        levels: [],
        goalTasks: [rawTask({ id: "orphan" })],
        todayPriorityGoalId: GOAL_ID,
      });
      expect(malformedIndex.size).toBe(0);

      const standalone = rawTask({
        id: "solo",
        title: "Standalone",
        goal_id: null,
        goal_level_id: null,
      });
      expect(
        filterDailyPlanPlanningTasks([standalone, rawTask({ id: "orphan" })], malformedIndex).map(
          (task) => task.id,
        ),
      ).toEqual(["solo"]);
    });

    it("11. multiple current-level tasks can all remain eligible", () => {
      const index = buildIndex([
        rawTask({ id: "one", title: "Task one" }),
        rawTask({ id: "two", title: "Task two" }),
      ]);

      expect(index.has("one")).toBe(true);
      expect(index.has("two")).toBe(true);
    });
  });

  describe("Today's Priority", () => {
    it("12-13. Today Priority Goal work identified and ordered first in prompt", () => {
      const index = buildIndex([
        rawTask({ id: "priority", title: "Email advisor", priority: "medium" }),
        rawTask({
          id: "other-goal-task",
          title: "Other goal task",
          goal_id: "goal-other",
          goal_level_id: "level-other",
        }),
      ], GOAL_ID);

      const otherGoal = goal({
        id: "goal-other",
        title: "Side goal",
      });

      const tasks = [
        planTask({
          id: "priority",
          title: "Email advisor",
          goalContext: {
            goalId: GOAL_ID,
            goalTitle: "Get off academic probation and get into Tippie",
            levelId: LEVEL_ONE,
            levelTitle: "Advisor process",
            isTodayPriority: true,
          },
        }),
        planTask({
          id: "other-goal-task",
          title: "Other goal task",
          goalContext: {
            goalId: "goal-other",
            goalTitle: "Side goal",
            levelId: "level-other",
            levelTitle: "Level one",
            isTodayPriority: false,
          },
        }),
        planTask({ id: "solo", title: "Pay rent", overdue: true }),
      ];

      const context = buildDailyPlanPlanningContext({
        planningTasks: tasks,
        goals: [goal(), otherGoal],
        todayPriorityGoalId: GOAL_ID,
        currentFocus: null,
      });

      const prompt = buildDailyPlanGoalPlanningPromptSections(context).join("\n");
      expect(prompt).toContain("TODAY'S PRIORITY GOAL WORK");
      expect(prompt).toContain("Get off academic probation and get into Tippie");
      expect(prompt).toContain("Advisor process");
      expect(prompt.indexOf("TODAY'S PRIORITY GOAL WORK")).toBeLessThan(
        prompt.indexOf("STANDALONE TASKS"),
      );
    });

    it("14. priority Goal with zero actionable tasks receives no boost", () => {
      const index = buildIndex([
        rawTask({
          id: "blocked-only",
          title: "Blocked only",
          blocked_at: "2026-08-11T00:00:00.000Z",
        }),
      ]);

      const context = planningContextFromRaw(
        filterDailyPlanPlanningTasks([rawTask({
          id: "blocked-only",
          title: "Blocked only",
          blocked_at: "2026-08-11T00:00:00.000Z",
        })], index),
        index,
      );

      expect(context.todayPriorityGoal).toBeNull();
      const instructions = buildDailyPlanPriorityInstructionSection(context, null);
      expect(instructions).toContain("no actionable current-level tasks");
    });

    it("15. null/stale Today Priority safe", () => {
      const index = buildIndex([rawTask({ id: "solo", title: "Solo", goal_id: null, goal_level_id: null })], null);
      const context = planningContextFromRaw(
        filterDailyPlanPlanningTasks(
          [rawTask({ id: "solo", title: "Solo", goal_id: null, goal_level_id: null })],
          index,
        ),
        index,
        { todayPriorityGoalId: null },
      );

      expect(context.todayPriorityGoal).toBeNull();
      expect(buildDailyPlanGoalPlanningPromptSections(context).join("\n")).not.toContain(
        "TODAY'S PRIORITY GOAL WORK",
      );
    });
  });

  describe("current_focus", () => {
    it("16. eligible exact current_focus task gets highest planning emphasis", () => {
      const tasks = [
        planTask({ id: "focus", title: "Meet with advisor" }),
        planTask({ id: "other", title: "Other task" }),
      ];
      const context = buildDailyPlanPlanningContext({
        planningTasks: tasks,
        goals: [goal()],
        todayPriorityGoalId: GOAL_ID,
        currentFocus: "Meet with advisor",
      });

      expect(context.eligibleCurrentFocusTaskId).toBe("focus");
      const prompt = buildDailyPlanGoalPlanningPromptSections(context).join("\n");
      expect(prompt).toContain("ELIGIBLE CURRENT FOCUS TASK");
      expect(prompt).toContain("Meet with advisor");
    });

    it("17. current_focus matching locked Goal task cannot resurrect it", () => {
      const allTasks = [
        rawTask({ id: "open", title: "Open task" }),
        rawTask({ id: "locked", title: "Locked task", goal_level_id: LEVEL_TWO }),
      ];
      const index = buildIndex(allTasks);
      const filtered = filterDailyPlanPlanningTasks(allTasks, index);
      const context = planningContextFromRaw(filtered, index, {
        currentFocus: "Locked task",
      });

      expect(context.eligibleCurrentFocusTaskId).toBeNull();
      expect(filtered.map((task) => task.id)).toEqual(["open"]);
    });

    it("18. current_focus matching blocked Goal task cannot resurrect it", () => {
      const index = buildIndex([
        rawTask({
          id: "blocked",
          title: "Blocked task",
          blocked_at: "2026-08-11T00:00:00.000Z",
        }),
      ]);
      const filtered = filterDailyPlanPlanningTasks(
        [
          rawTask({
            id: "blocked",
            title: "Blocked task",
            blocked_at: "2026-08-11T00:00:00.000Z",
          }),
        ],
        index,
      );
      const context = planningContextFromRaw(filtered, index, {
        currentFocus: "Blocked task",
      });

      expect(context.eligibleCurrentFocusTaskId).toBeNull();
    });

    it("19. current_focus matching non-short-term Goal task cannot resurrect it", () => {
      const index = buildDailyPlanActionableIndex({
        goals: [goal({ goal_type: "long_term" })],
        levels: [{ id: LEVEL_ONE, name: "L1", position: 1, goal_id: GOAL_ID }],
        goalTasks: [rawTask({ id: "lt", title: "Long term task" })],
        todayPriorityGoalId: GOAL_ID,
      });
      const filtered = filterDailyPlanPlanningTasks(
        [rawTask({ id: "lt", title: "Long term task" })],
        index,
      );
      const context = planningContextFromRaw(filtered, index, {
        currentFocus: "Long term task",
      });

      expect(context.eligibleCurrentFocusTaskId).toBeNull();
    });

    it("20. unmatched free-text current_focus remains context only", () => {
      const tasks = [planTask({ id: "other", title: "Other task" })];
      const context = buildDailyPlanPlanningContext({
        planningTasks: tasks,
        goals: [goal()],
        todayPriorityGoalId: GOAL_ID,
        currentFocus: "Finish my novel",
      });

      expect(context.eligibleCurrentFocusTaskId).toBeNull();
      const instructions = buildDailyPlanPriorityInstructionSection(
        context,
        "Finish my novel",
      );
      expect(instructions).toContain("context only");
      expect(buildDailyPlanGoalPlanningPromptSections(context).join("\n")).not.toContain(
        "ELIGIBLE CURRENT FOCUS TASK",
      );
    });
  });

  describe("urgent standalone", () => {
    it("21-22. overdue standalone remains eligible when priority Goal exists", () => {
      const index = buildIndex([
        rawTask({ id: "goal-task", title: "Goal task" }),
      ]);
      const filtered = filterDailyPlanPlanningTasks(
        [
          rawTask({ id: "goal-task", title: "Goal task" }),
          rawTask({
            id: "urgent",
            title: "Pay rent",
            goal_id: null,
            goal_level_id: null,
            priority: "high",
            due_at: "2026-08-10T12:00:00.000Z",
          }),
        ],
        index,
      );
      const context = planningContextFromRaw(filtered, index);

      expect(context.standaloneTasks.map((task) => task.id)).toEqual(["urgent"]);
      expect(context.todayPriorityGoal?.tasks.map((task) => task.id)).toEqual(["goal-task"]);

      const prompt = buildDailyPlanGoalPlanningPromptSections(context).join("\n");
      expect(prompt).toContain("Pay rent");
      expect(prompt).toContain("TODAY'S PRIORITY GOAL WORK");
    });
  });

  describe("prompt structure", () => {
    it("23-26. prompt sections include eligible work and exclude ineligible tasks", () => {
      const index = buildIndex([
        rawTask({ id: "actionable", title: "Meet with advisor" }),
        rawTask({ id: "locked", title: "Locked", goal_level_id: LEVEL_TWO }),
        rawTask({
          id: "blocked",
          title: "Blocked",
          blocked_at: "2026-08-11T00:00:00.000Z",
        }),
      ]);
      const filtered = filterDailyPlanPlanningTasks(
        [
          rawTask({ id: "actionable", title: "Meet with advisor" }),
          rawTask({ id: "locked", title: "Locked", goal_level_id: LEVEL_TWO }),
          rawTask({
            id: "blocked",
            title: "Blocked",
            blocked_at: "2026-08-11T00:00:00.000Z",
          }),
          rawTask({
            id: "solo",
            title: "Standalone task",
            goal_id: null,
            goal_level_id: null,
          }),
        ],
        index,
      );
      const context = planningContextFromRaw(filtered, index);
      const prompt = buildDailyPlanGoalPlanningPromptSections(context).join("\n");

      expect(prompt).toContain("TODAY'S PRIORITY GOAL WORK");
      expect(prompt).toContain("Meet with advisor");
      expect(prompt).toContain("STANDALONE TASKS");
      expect(prompt).toContain("Standalone task");
      expect(prompt).not.toContain("Locked");
      expect(prompt).not.toContain("Blocked");
    });
  });

  describe("task source allowlist", () => {
    it("27. task-backed suggested item with eligible sourceId passes", () => {
      const allowlist = new Set(["eligible-id"]);
      const filtered = filterSuggestedItemsByTaskAllowlist(
        [suggestedTaskItem("eligible-id")],
        allowlist,
      );
      expect(filtered).toHaveLength(1);
    });

    it("28-30. ineligible or fabricated task sourceIds rejected", () => {
      const allowlist = new Set(["eligible-id"]);

      expect(
        filterSuggestedItemsByTaskAllowlist(
          [suggestedTaskItem("00000000-0000-4000-8000-000000000099")],
          allowlist,
        ),
      ).toHaveLength(0);

      expect(
        filterSuggestedItemsByTaskAllowlist(
          [suggestedTaskItem("00000000-0000-4000-8000-000000000088")],
          allowlist,
        ),
      ).toHaveLength(0);

      expect(
        filterSuggestedItemsByTaskAllowlist(
          [suggestedTaskItem("eligible-id"), suggestedTaskItem("00000000-0000-4000-8000-000000000099")],
          allowlist,
        ),
      ).toHaveLength(1);
    });

    it("31. non-task/calendar item behavior unchanged", () => {
      const allowlist = new Set(["eligible-id"]);
      const bufferItem = {
        startTime: "2026-08-11T12:00:00-05:00",
        endTime: "2026-08-11T13:00:00-05:00",
        title: "Lunch",
        type: "meal" as const,
        source: "jarvis" as const,
        sourceId: null,
        isFixed: false,
        reason: "Break",
      };

      expect(isValidSuggestedPlanItem(bufferItem)).toBe(true);
      expect(
        filterSuggestedItemsByTaskAllowlist([bufferItem], allowlist),
      ).toHaveLength(1);
    });
  });

  describe("regressions and wiring", () => {
    it("32-36. generator preserves calendar, melusi, brief, and no completion", () => {
      const generator = readSource("lib/jarvis/plans/generate-daily-plan.ts");

      expect(generator).toContain("listOutlookCalendar");
      expect(generator).toContain("validateSuggestedItems");
      expect(generator).toContain("loadMelusiPlanningSnapshot");
      expect(generator).toContain("morning_briefings");
      expect(generator).not.toContain("completeTask");
      expect(generator).not.toContain("listTasks(supabase, userId)");
    });

    it("37. actionable-goal-tasks.ts semantics unchanged", () => {
      const helper = readSource("lib/jarvis/plans/daily-plan-goal-planning.ts");
      expect(helper).toContain("buildActionableGoalTaskIndex");
      expect(helper).toContain("filterUnfinishedPlanningTasks");
      expect(helper).not.toMatch(/function buildActionableGoalTaskIndex/);
    });

    it("38-39. Command Center and Morning Brief unchanged", () => {
      const cc = readSource("lib/jarvis/dashboard/load-command-center.ts");
      const brief = readSource("lib/jarvis/briefings/generate-morning-brief.ts");

      expect(cc).toContain("buildActionableGoalTaskIndex");
      expect(brief).toContain("buildMorningBriefActionableIndex");
      expect(brief).toContain("listMorningBriefTasks");
    });

    it("ordering helper promotes overdue standalone ahead of routine work", () => {
      const overdue = planTask({
        id: "overdue",
        title: "Overdue",
        overdue: true,
        priority: "high",
      });
      const routine = planTask({
        id: "routine",
        title: "Routine",
        priority: "medium",
      });

      expect(compareDailyPlanTasks(overdue, routine)).toBeLessThan(0);
    });

    it("resolveEligibleCurrentFocusTaskId is case-insensitive", () => {
      const tasks = [planTask({ id: "focus", title: "Meet With Advisor" })];
      expect(resolveEligibleCurrentFocusTaskId(tasks, "meet with advisor")).toBe("focus");
    });

    it("allowlist matches exact filtered planning set", () => {
      const tasks = [
        planTask({ id: "a", title: "A" }),
        planTask({ id: "b", title: "B" }),
      ];
      expect(buildDailyPlanTaskAllowlist(tasks)).toEqual(new Set(["a", "b"]));
    });
  });
});
