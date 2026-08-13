import { describe, expect, it } from "vitest";
import {
  buildFilterCounts,
  filterGoalsForTab,
  resolveDefaultSelectedGoalId,
  resolveSelectedGoalId,
} from "./goals-dashboard-state";
import type { GoalView } from "./types";

const GOAL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GOAL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GOAL_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function goal(overrides: Partial<GoalView> & Pick<GoalView, "id">): GoalView {
  return {
    id: overrides.id,
    title: overrides.title ?? "Goal",
    description: null,
    notes: null,
    targetDate: null,
    domain: overrides.domain ?? "personal",
    status: overrides.status ?? "active",
    sortOrder: 0,
    completedAt: null,
    progressPercent: overrides.progressPercent ?? 40,
    levels: [],
    isCurrentPriority: overrides.isCurrentPriority ?? false,
    isTodayPriority: overrides.isTodayPriority ?? false,
  };
}

describe("goals dashboard state", () => {
  const goals = [
    goal({ id: GOAL_A, domain: "personal", isCurrentPriority: true }),
    goal({ id: GOAL_B, domain: "personal" }),
    goal({
      id: GOAL_C,
      domain: "personal",
      status: "completed",
      progressPercent: 100,
    }),
  ];

  it("builds filter counts from active workspace data", () => {
    expect(
      buildFilterCounts({
        all: 3,
        active: 2,
        completed: 1,
        priority: 1,
      }),
    ).toEqual({
      all: 2,
      priority: 1,
      completed: 1,
    });
  });

  it("filters all, priority, and completed sets for the active workspace", () => {
    expect(filterGoalsForTab(goals, "all", GOAL_A).map((entry) => entry.id)).toEqual([
      GOAL_A,
      GOAL_B,
    ]);
    expect(filterGoalsForTab(goals, "priority", GOAL_A).map((entry) => entry.id)).toEqual([
      GOAL_A,
    ]);
    expect(filterGoalsForTab(goals, "completed", GOAL_A).map((entry) => entry.id)).toEqual([
      GOAL_C,
    ]);
    expect(filterGoalsForTab(goals, "priority", null)).toEqual([]);
  });

  it("never mixes opposite-domain goals into filter results", () => {
    const mixed = [
      goal({ id: GOAL_A, domain: "melusi" }),
      goal({ id: GOAL_B, domain: "personal" }),
    ];

    expect(filterGoalsForTab([mixed[0]], "all", null)).toEqual([mixed[0]]);
    expect(filterGoalsForTab([mixed[1]], "all", null)).toEqual([mixed[1]]);
  });

  it("selects current priority by default when available", () => {
    const filtered = filterGoalsForTab(goals, "all", GOAL_A);

    expect(resolveDefaultSelectedGoalId(filtered, GOAL_A, "all")).toBe(GOAL_A);
  });

  it("selects the first goal when no priority exists", () => {
    const filtered = filterGoalsForTab(
      [goal({ id: GOAL_B }), goal({ id: GOAL_A })],
      "all",
      null,
    );

    expect(resolveDefaultSelectedGoalId(filtered, null, "all")).toBe(GOAL_B);
  });

  it("resets invalid selections after filter changes", () => {
    const allFiltered = filterGoalsForTab(goals, "all", GOAL_A);
    const completedFiltered = filterGoalsForTab(goals, "completed", GOAL_A);

    expect(
      resolveSelectedGoalId(GOAL_A, completedFiltered, GOAL_A, "completed"),
    ).toBe(GOAL_C);
    expect(resolveSelectedGoalId(GOAL_C, allFiltered, GOAL_A, "all")).toBe(GOAL_A);
  });

  it("returns null when a filter has no goals", () => {
    expect(resolveSelectedGoalId(null, [], null, "priority")).toBeNull();
  });
});
