import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildActionableGoalTaskIndex,
  filterUnfinishedPlanningTasks,
  getActionableGoalTaskContext,
  isActionableGoalPlanningTask,
  isKanbanUnfinishedCandidate,
  isStandalonePlanningTask,
  type PlanningGoalLevelRecord,
  type PlanningGoalRecord,
  type PlanningGoalTaskRecord,
} from "./actionable-goal-tasks";

const ROOT = resolve(import.meta.dirname, "../../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

const GOAL_SHORT = "goal-short";
const GOAL_THREE = "goal-three";
const GOAL_LONG = "goal-long";
const GOAL_COMPLETED = "goal-completed";
const GOAL_ARCHIVED = "goal-archived";

const LEVEL_ONE = "level-1";
const LEVEL_TWO = "level-2";
const LEVEL_THREE = "level-3";

function goal(
  overrides: Partial<PlanningGoalRecord> & Pick<PlanningGoalRecord, "id">,
): PlanningGoalRecord {
  return {
    title: overrides.title ?? overrides.id,
    goal_type: overrides.goal_type ?? "short_term",
    status: overrides.status ?? "active",
    domain: overrides.domain ?? "personal",
    ...overrides,
  };
}

function level(
  id: string,
  position: number,
  goalId = GOAL_SHORT,
  name?: string,
): PlanningGoalLevelRecord {
  return {
    id,
    name: name ?? `Level ${position}`,
    position,
    goal_id: goalId,
  };
}

function task(
  overrides: Partial<PlanningGoalTaskRecord> & Pick<PlanningGoalTaskRecord, "id">,
): PlanningGoalTaskRecord {
  return {
    title: overrides.title ?? overrides.id,
    status: overrides.status ?? "todo",
    goal_id: overrides.goal_id ?? GOAL_SHORT,
    goal_level_id: overrides.goal_level_id ?? LEVEL_ONE,
    blocked_at: overrides.blocked_at ?? null,
    position: overrides.position ?? 0,
    ...overrides,
  };
}

function buildIndex(
  goals: PlanningGoalRecord[],
  levels: PlanningGoalLevelRecord[],
  goalTasks: PlanningGoalTaskRecord[],
  priorityGoalIds: Set<string> = new Set(),
) {
  return buildActionableGoalTaskIndex({
    goals,
    levels,
    goalTasks,
    priorityGoalIds,
  });
}

describe("actionable goal tasks — actionability", () => {
  it("1. standalone unfinished task remains eligible", () => {
    const standalone = task({
      id: "standalone",
      goal_id: null,
      goal_level_id: null,
    });

    expect(isStandalonePlanningTask(standalone)).toBe(true);
    expect(
      filterUnfinishedPlanningTasks([standalone], new Map()).map((entry) => entry.id),
    ).toEqual(["standalone"]);
  });

  it("2. active Short Term current-level unfinished unblocked task eligible", () => {
    const index = buildIndex(
      [goal({ id: GOAL_SHORT, title: "Academic Probation" })],
      [level(LEVEL_ONE, 1, GOAL_SHORT, "Advisor Process")],
      [task({ id: "actionable", title: "Email advisor" })],
    );

    expect(index.has("actionable")).toBe(true);
    expect(getActionableGoalTaskContext("actionable", index)?.levelTitle).toBe(
      "Advisor Process",
    );
  });

  it("3. locked future-level task excluded", () => {
    const index = buildIndex(
      [goal({ id: GOAL_SHORT })],
      [level(LEVEL_ONE, 1), level(LEVEL_TWO, 2)],
      [
        task({ id: "current", goal_level_id: LEVEL_ONE, status: "todo" }),
        task({ id: "locked", goal_level_id: LEVEL_TWO, status: "todo" }),
      ],
    );

    expect(index.has("current")).toBe(true);
    expect(index.has("locked")).toBe(false);
  });

  it("4. blocked current-level task excluded", () => {
    const index = buildIndex(
      [goal({ id: GOAL_SHORT })],
      [level(LEVEL_ONE, 1)],
      [
        task({
          id: "blocked",
          blocked_at: "2026-08-09T00:00:00.000Z",
        }),
      ],
    );

    expect(index.has("blocked")).toBe(false);
  });

  it("5. three_month task excluded", () => {
    const index = buildIndex(
      [goal({ id: GOAL_THREE, goal_type: "three_month" })],
      [level(LEVEL_ONE, 1, GOAL_THREE)],
      [task({ id: "three-month", goal_id: GOAL_THREE, goal_level_id: LEVEL_ONE })],
    );

    expect(index.size).toBe(0);
    expect(
      isActionableGoalPlanningTask(
        task({ id: "three-month", goal_id: GOAL_THREE }),
        index,
      ),
    ).toBe(false);
  });

  it("6. long_term task excluded", () => {
    const index = buildIndex(
      [goal({ id: GOAL_LONG, goal_type: "long_term" })],
      [level(LEVEL_ONE, 1, GOAL_LONG)],
      [task({ id: "long-term", goal_id: GOAL_LONG, goal_level_id: LEVEL_ONE })],
    );

    expect(index.size).toBe(0);
  });

  it("7. completed-goal unfinished task excluded", () => {
    const index = buildIndex(
      [goal({ id: GOAL_COMPLETED, status: "completed" })],
      [level(LEVEL_ONE, 1, GOAL_COMPLETED)],
      [
        task({
          id: "orphan",
          goal_id: GOAL_COMPLETED,
          goal_level_id: LEVEL_ONE,
          status: "todo",
        }),
      ],
    );

    expect(index.size).toBe(0);
  });

  it("8. archived-goal task excluded through helper boundary", () => {
    const index = buildIndex(
      [goal({ id: GOAL_ARCHIVED, status: "archived" })],
      [level(LEVEL_ONE, 1, GOAL_ARCHIVED)],
      [
        task({
          id: "archived-task",
          goal_id: GOAL_ARCHIVED,
          goal_level_id: LEVEL_ONE,
        }),
      ],
    );

    expect(index.size).toBe(0);
  });

  it("9. done current-level task not unfinished planning candidate", () => {
    const index = buildIndex(
      [goal({ id: GOAL_SHORT })],
      [level(LEVEL_ONE, 1)],
      [task({ id: "done-task", status: "done" })],
    );

    expect(index.has("done-task")).toBe(false);
    expect(
      filterUnfinishedPlanningTasks(
        [task({ id: "done-task", status: "done" })],
        index,
      ),
    ).toEqual([]);
  });

  it("10. multiple tasks in current level can all be actionable", () => {
    const index = buildIndex(
      [goal({ id: GOAL_SHORT })],
      [level(LEVEL_ONE, 1)],
      [
        task({ id: "a", position: 1 }),
        task({ id: "b", position: 2, status: "in_progress" }),
      ],
    );

    expect([...index.keys()].sort()).toEqual(["a", "b"]);
  });
});

describe("actionable goal tasks — current level", () => {
  it("11. first incomplete level is current", () => {
    const index = buildIndex(
      [goal({ id: GOAL_SHORT })],
      [level(LEVEL_ONE, 1), level(LEVEL_TWO, 2), level(LEVEL_THREE, 3)],
      [
        task({ id: "l1-open", goal_level_id: LEVEL_ONE }),
        task({ id: "l2-task", goal_level_id: LEVEL_TWO }),
      ],
    );

    expect(index.has("l1-open")).toBe(true);
    expect(index.has("l2-task")).toBe(false);
  });

  it("12. when current level completes, next level becomes actionable", () => {
    const index = buildIndex(
      [goal({ id: GOAL_SHORT })],
      [level(LEVEL_ONE, 1), level(LEVEL_TWO, 2)],
      [
        task({ id: "l1-done", goal_level_id: LEVEL_ONE, status: "done" }),
        task({ id: "l2-open", goal_level_id: LEVEL_TWO, status: "todo" }),
      ],
    );

    expect(index.has("l1-done")).toBe(false);
    expect(index.has("l2-open")).toBe(true);
    expect(getActionableGoalTaskContext("l2-open", index)?.levelId).toBe(LEVEL_TWO);
  });

  it("13. later levels remain locked", () => {
    const index = buildIndex(
      [goal({ id: GOAL_SHORT })],
      [level(LEVEL_ONE, 1), level(LEVEL_TWO, 2), level(LEVEL_THREE, 3)],
      [
        task({ id: "current", goal_level_id: LEVEL_ONE }),
        task({ id: "locked-2", goal_level_id: LEVEL_TWO }),
        task({ id: "locked-3", goal_level_id: LEVEL_THREE }),
      ],
    );

    expect(index.has("current")).toBe(true);
    expect(index.has("locked-2")).toBe(false);
    expect(index.has("locked-3")).toBe(false);
  });

  it("14. malformed/indeterminate roadmap fails closed", () => {
    const noLevelsIndex = buildIndex([goal({ id: GOAL_SHORT })], [], [
      task({ id: "orphan-level", goal_level_id: LEVEL_ONE }),
    ]);
    expect(noLevelsIndex.size).toBe(0);

    const allCompleteActiveGoal = buildIndex(
      [goal({ id: GOAL_SHORT, status: "active" })],
      [level(LEVEL_ONE, 1)],
      [task({ id: "done-only", status: "done" })],
    );
    expect(allCompleteActiveGoal.size).toBe(0);

    const missingLevelRef = buildIndex(
      [goal({ id: GOAL_SHORT })],
      [level(LEVEL_ONE, 1)],
      [task({ id: "missing-level", goal_level_id: "missing-level-id" })],
    );
    expect(missingLevelRef.size).toBe(0);
  });
});

describe("actionable goal tasks — today priority context", () => {
  it("15-18. priority context flags and null priority are safe", () => {
    const index = buildIndex(
      [goal({ id: GOAL_SHORT, title: "Priority Goal" })],
      [level(LEVEL_ONE, 1, GOAL_SHORT, "Current Level")],
      [task({ id: "priority-task" })],
      new Set([GOAL_SHORT]),
    );

    expect(getActionableGoalTaskContext("priority-task", index)).toMatchObject({
      goalTitle: "Priority Goal",
      levelTitle: "Current Level",
      isTodayPriority: true,
    });

    const staleIndex = buildIndex(
      [goal({ id: GOAL_SHORT })],
      [level(LEVEL_ONE, 1)],
      [task({ id: "plain-task" })],
      new Set(["missing-goal-id"]),
    );

    expect(
      getActionableGoalTaskContext("plain-task", staleIndex)?.isTodayPriority,
    ).toBe(false);

    const nullIndex = buildIndex(
      [goal({ id: GOAL_SHORT })],
      [level(LEVEL_ONE, 1)],
      [task({ id: "null-priority-task" })],
      null,
    );

    expect(
      getActionableGoalTaskContext("null-priority-task", nullIndex)?.isTodayPriority,
    ).toBe(false);
  });
});

describe("actionable goal tasks — context shape", () => {
  it("23-25. actionable goal task receives context; standalone has none", () => {
    const index = buildIndex(
      [goal({ id: GOAL_SHORT, title: "Get off academic probation" })],
      [level(LEVEL_ONE, 1, GOAL_SHORT, "Advisor process")],
      [task({ id: "goal-task", title: "Meet advisor" })],
    );

    expect(getActionableGoalTaskContext("goal-task", index)).toEqual({
      goalId: GOAL_SHORT,
      goalTitle: "Get off academic probation",
      goalDomain: "personal",
      levelId: LEVEL_ONE,
      levelTitle: "Advisor process",
      isTodayPriority: false,
    });

    const standalone = task({ id: "solo", goal_id: null, goal_level_id: null });
    expect(getActionableGoalTaskContext("solo", index)).toBeNull();
    expect(isStandalonePlanningTask(standalone)).toBe(true);
  });
});

describe("actionable goal tasks — kanban eligibility", () => {
  it("28. locked/blocked goal tasks absent from unfinished kanban candidates", () => {
    const index = buildIndex(
      [goal({ id: GOAL_SHORT })],
      [level(LEVEL_ONE, 1), level(LEVEL_TWO, 2)],
      [
        task({ id: "open", goal_level_id: LEVEL_ONE }),
        task({ id: "locked", goal_level_id: LEVEL_TWO }),
        task({
          id: "blocked",
          goal_level_id: LEVEL_ONE,
          blocked_at: "2026-08-09T00:00:00.000Z",
        }),
        task({ id: "done", goal_level_id: LEVEL_ONE, status: "done" }),
      ],
    );

    expect(isKanbanUnfinishedCandidate(task({ id: "open" }), index)).toBe(true);
    expect(isKanbanUnfinishedCandidate(task({ id: "locked" }), index)).toBe(false);
    expect(isKanbanUnfinishedCandidate(task({ id: "blocked" }), index)).toBe(false);
    expect(
      isKanbanUnfinishedCandidate(task({ id: "done", status: "done" }), index),
    ).toBe(true);
    expect(
      isKanbanUnfinishedCandidate(
        task({ id: "solo", goal_id: null, goal_level_id: null }),
        index,
      ),
    ).toBe(true);
  });
});

describe("Phase 1B2-H1B Command Center integration", () => {
  it("31-32. Command Center completion still uses unified H1A dispatcher", () => {
    const actions = readSource("app/command-center/actions.ts");
    const loader = readSource("lib/jarvis/dashboard/load-command-center.ts");
    const kanban = readSource("components/jarvis/command-center/command-kanban.tsx");

    expect(actions).toContain('from "@/lib/jarvis/tools/task-tools"');
    expect(actions).toContain("await completeTask(supabase, userId");
    expect(actions).not.toMatch(
      /completeTaskFromDashboard[\s\S]*\.from\("tasks"\)[\s\S]*\.update\(\{/,
    );
    expect(loader).toContain("jarvis_visible_tasks");
    expect(loader).toContain("filterUnfinishedPlanningTasks");
    expect(kanban).toContain("goalContext");
  });
});
