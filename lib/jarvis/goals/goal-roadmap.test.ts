import { describe, expect, it } from "vitest";
import {
  buildGoalLevelViews,
  buildGoalTaskView,
  computeGoalProgressPercent,
  deriveLevelStates,
  filterGoalsByDomain,
  isTaskBlocked,
  isTaskDone,
  sortLevelsByPosition,
  sortTasksByPosition,
  type RawGoalLevel,
  type RawGoalTask,
} from "./goal-roadmap";

const LEVEL_ONE = "level-1";
const LEVEL_TWO = "level-2";
const LEVEL_THREE = "level-3";

function task(
  overrides: Partial<RawGoalTask> & Pick<RawGoalTask, "id" | "goal_level_id">,
): RawGoalTask {
  return {
    title: overrides.title ?? overrides.id,
    status: overrides.status ?? "todo",
    position: overrides.position ?? 0,
    notes: overrides.notes ?? null,
    blocked_at: overrides.blocked_at ?? null,
    blocked_reason: overrides.blocked_reason ?? null,
    ...overrides,
  };
}

function level(id: string, position: number): RawGoalLevel {
  return {
    id,
    name: `Level ${position}`,
    position,
    goal_id: "goal-1",
  };
}

describe("goal roadmap derivation", () => {
  it("F. sorts levels by position ascending", () => {
    const levels = [level(LEVEL_THREE, 3), level(LEVEL_ONE, 1), level(LEVEL_TWO, 2)];
    const sorted = sortLevelsByPosition(levels);

    expect(sorted.map((entry) => entry.position)).toEqual([1, 2, 3]);
  });

  it("G. sorts tasks by position within a level", () => {
    const tasks = sortTasksByPosition([
      task({ id: "t3", goal_level_id: LEVEL_ONE, position: 3 }),
      task({ id: "t1", goal_level_id: LEVEL_ONE, position: 1 }),
      task({ id: "t2", goal_level_id: LEVEL_ONE, position: 2 }),
    ]);

    expect(tasks.map((entry) => entry.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("H. marks all unfinished tasks in the current level as actionable", () => {
    const levels = [level(LEVEL_ONE, 1)];
    const tasksByLevelId = new Map<string, RawGoalTask[]>([
      [
        LEVEL_ONE,
        [
          task({ id: "a", goal_level_id: LEVEL_ONE, status: "todo", position: 1 }),
          task({
            id: "b",
            goal_level_id: LEVEL_ONE,
            status: "in_progress",
            position: 2,
          }),
        ],
      ],
    ]);

    const views = buildGoalLevelViews(levels, tasksByLevelId);
    const actionable = views[0].tasks.filter((entry) => entry.isActionable);

    expect(views[0].state).toBe("current");
    expect(actionable).toHaveLength(2);
  });

  it("I. advances current level after the previous level is complete", () => {
    const levels = [level(LEVEL_ONE, 1), level(LEVEL_TWO, 2)];
    const tasksByLevelId = new Map<string, RawGoalTask[]>([
      [LEVEL_ONE, [task({ id: "done", goal_level_id: LEVEL_ONE, status: "done" })]],
      [LEVEL_TWO, [task({ id: "next", goal_level_id: LEVEL_TWO, status: "todo" })]],
    ]);

    const states = deriveLevelStates(levels, tasksByLevelId);

    expect(states.get(LEVEL_ONE)).toBe("complete");
    expect(states.get(LEVEL_TWO)).toBe("current");
  });

  it("J. locks all levels after the current level", () => {
    const levels = [
      level(LEVEL_ONE, 1),
      level(LEVEL_TWO, 2),
      level(LEVEL_THREE, 3),
    ];
    const tasksByLevelId = new Map<string, RawGoalTask[]>([
      [LEVEL_ONE, [task({ id: "done", goal_level_id: LEVEL_ONE, status: "done" })]],
      [
        LEVEL_TWO,
        [task({ id: "current", goal_level_id: LEVEL_TWO, status: "todo" })],
      ],
      [LEVEL_THREE, [task({ id: "locked", goal_level_id: LEVEL_THREE, status: "todo" })]],
    ]);

    const states = deriveLevelStates(levels, tasksByLevelId);

    expect(states.get(LEVEL_ONE)).toBe("complete");
    expect(states.get(LEVEL_TWO)).toBe("current");
    expect(states.get(LEVEL_THREE)).toBe("locked");
  });

  it("K. returns 100% progress when every task is done", () => {
    const levels = [level(LEVEL_ONE, 1), level(LEVEL_TWO, 2)];
    const tasksByLevelId = new Map<string, RawGoalTask[]>([
      [LEVEL_ONE, [task({ id: "a", goal_level_id: LEVEL_ONE, status: "done" })]],
      [LEVEL_TWO, [task({ id: "b", goal_level_id: LEVEL_TWO, status: "done" })]],
    ]);

    expect(computeGoalProgressPercent(levels, tasksByLevelId)).toBe(100);
  });

  it("L. uses completed levels plus current-level fraction for partial progress", () => {
    const levels = [level(LEVEL_ONE, 1), level(LEVEL_TWO, 2), level(LEVEL_THREE, 3)];
    const tasksByLevelId = new Map<string, RawGoalTask[]>([
      [LEVEL_ONE, [task({ id: "a", goal_level_id: LEVEL_ONE, status: "done" })]],
      [
        LEVEL_TWO,
        [
          task({ id: "b", goal_level_id: LEVEL_TWO, status: "done" }),
          task({ id: "c", goal_level_id: LEVEL_TWO, status: "todo" }),
        ],
      ],
      [LEVEL_THREE, [task({ id: "d", goal_level_id: LEVEL_THREE, status: "todo" })]],
    ]);

    expect(computeGoalProgressPercent(levels, tasksByLevelId)).toBe(50);
  });

  it("M. keeps blocked tasks visible and identified", () => {
    const view = buildGoalTaskView(
      task({
        id: "blocked",
        goal_level_id: LEVEL_ONE,
        blocked_at: "2026-08-08T12:00:00.000Z",
        blocked_reason: "Waiting on vendor",
      }),
      "current",
    );

    expect(view.isBlocked).toBe(true);
    expect(view.blockedReason).toBe("Waiting on vendor");
    expect(isTaskBlocked(view.blockedAt)).toBe(true);
  });

  it("N. preserves task notes on the view model", () => {
    const view = buildGoalTaskView(
      task({
        id: "noted",
        goal_level_id: LEVEL_ONE,
        notes: "Follow up Monday",
      }),
      "current",
    );

    expect(view.notes).toBe("Follow up Monday");
  });

  it("D/E. filters goals by explicit domain only", () => {
    const goals = [
      { id: "1", domain: "personal" },
      { id: "2", domain: "melusi" },
      { id: "3", domain: "personal" },
    ];

    expect(filterGoalsByDomain(goals, "personal").map((goal) => goal.id)).toEqual([
      "1",
      "3",
    ]);
    expect(filterGoalsByDomain(goals, "melusi").map((goal) => goal.id)).toEqual(["2"]);
  });

  it("treats done status as complete regardless of blocked_at", () => {
    expect(isTaskDone("done")).toBe(true);
  });
});
