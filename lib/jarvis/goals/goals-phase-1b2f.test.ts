import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { GoalCard } from "@/components/jarvis/goals/goal-card";
import { GoalTaskRow } from "@/components/jarvis/goals/goal-task-row";
import { LevelRoadmap } from "@/components/jarvis/goals/level-roadmap";
import type { GoalLevelView, GoalTaskView, GoalView } from "@/lib/jarvis/goals/types";

const ROOT = resolve(import.meta.dirname, "../../..");
const MIGRATION_PATH =
  "supabase/migrations/20260809040000_add_jarvis_goal_reorder_rpcs.sql";

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function sampleTask(overrides: Partial<GoalTaskView> = {}): GoalTaskView {
  return {
    id: "task-1",
    title: "Write release notes",
    status: "todo",
    position: 10,
    notes: null,
    blockedAt: null,
    blockedReason: null,
    isBlocked: false,
    isDone: false,
    isActionable: true,
    ...overrides,
  };
}

function sampleLevel(overrides: Partial<GoalLevelView> = {}): GoalLevelView {
  return {
    id: "level-1",
    name: "Foundation",
    position: 10,
    state: "current",
    tasks: [
      sampleTask(),
      sampleTask({ id: "task-2", title: "Ship build", position: 20 }),
    ],
    ...overrides,
  };
}

function sampleGoal(overrides: Partial<GoalView> = {}): GoalView {
  return {
    id: "goal-1",
    title: "Launch beta",
    description: "Ship the first beta release.",
    domain: "personal",
    status: "active",
    sortOrder: 0,
    completedAt: null,
    progressPercent: 40,
    isTodayPriority: false,
    levels: [
      sampleLevel(),
      sampleLevel({ id: "level-2", name: "Launch", position: 20, state: "locked" }),
    ],
    ...overrides,
  };
}

vi.mock("@/app/goals/actions", () => ({
  publishShortTermGoal: vi.fn(),
  publishThreeMonthGoal: vi.fn(),
  publishLongTermGoal: vi.fn(),
  setTodayPriorityGoal: vi.fn(),
  clearTodayPriorityGoal: vi.fn(),
  setGoalTaskCompletion: vi.fn(),
  setGoalTaskNotes: vi.fn(),
  setGoalTaskBlockState: vi.fn(),
  addGoalTask: vi.fn(),
  editGoalTaskTitle: vi.fn(),
  deleteGoalTask: vi.fn(),
  addGoalLevel: vi.fn(),
  editGoalLevelName: vi.fn(),
  deleteGoalLevel: vi.fn(),
  moveGoalLevel: vi.fn(),
  moveGoalTask: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("Jarvis goals phase 1B2F reordering", () => {
  const migration = readFileSync(resolve(ROOT, MIGRATION_PATH), "utf8");

  it("BA. active levels show Move up and Move down while editing", () => {
    const html = renderToStaticMarkup(
      createElement(LevelRoadmap, {
        goalId: "goal-1",
        goalStatus: "active",
        isEditing: true,
        levels: [
          sampleLevel({ state: "current" }),
          sampleLevel({ id: "level-2", name: "Launch", position: 20, state: "locked" }),
        ],
      }),
    );

    expect(html.match(/Move up/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html.match(/Move down/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("BB. completed goal levels do NOT show reorder controls", () => {
    const html = renderToStaticMarkup(
      createElement(LevelRoadmap, {
        goalId: "goal-1",
        goalStatus: "completed",
        levels: [sampleLevel({ state: "complete" })],
      }),
    );

    expect(html).not.toContain("Move up");
    expect(html).not.toContain("Move down");
  });

  it("BC/BD. first level Up disabled and last level Down disabled while editing", () => {
    const html = renderToStaticMarkup(
      createElement(LevelRoadmap, {
        goalId: "goal-1",
        goalStatus: "active",
        isEditing: true,
        levels: [
          sampleLevel({ id: "level-1", position: 10 }),
          sampleLevel({ id: "level-2", name: "Launch", position: 20, state: "locked" }),
        ],
      }),
    );

    expect(html).toContain('disabled="" aria-label="Move Foundation up"');
    expect(html).toContain('disabled="" aria-label="Move Launch down"');
  });

  it("BE. active tasks show Move up and Move down while editing", () => {
    const html = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: sampleTask(),
        levelState: "current",
        goalStatus: "active",
        levelTaskCount: 2,
        taskIndex: 0,
        isEditing: true,
      }),
    );

    expect(html).toContain("Move up");
    expect(html).toContain("Move down");
  });

  it("BF. completed goal tasks do NOT show reorder controls", () => {
    const html = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: sampleTask({ status: "done", isDone: true }),
        levelState: "complete",
        goalStatus: "completed",
        levelTaskCount: 2,
        taskIndex: 0,
      }),
    );

    expect(html).not.toContain("Move up");
    expect(html).not.toContain("Move down");
  });

  it("BG/BH. first task Up disabled and last task Down disabled while editing", () => {
    const firstHtml = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: sampleTask(),
        levelState: "current",
        goalStatus: "active",
        levelTaskCount: 2,
        taskIndex: 0,
        isEditing: true,
      }),
    );
    const lastHtml = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: sampleTask({ id: "task-2", title: "Ship build", position: 20 }),
        levelState: "current",
        goalStatus: "active",
        levelTaskCount: 2,
        taskIndex: 1,
        isEditing: true,
      }),
    );

    expect(firstHtml).toContain('disabled="" aria-label="Move Write release notes up"');
    expect(lastHtml).toContain('disabled="" aria-label="Move Ship build down"');
  });

  it("BK. no drag/drop controls", () => {
    for (const file of [
      "components/jarvis/goals/level-roadmap.tsx",
      "components/jarvis/goals/goal-task-row.tsx",
    ]) {
      expect(readSource(file)).not.toMatch(/drag|dnd|reorder handle/i);
    }
  });

  it("reorder code does not touch current_focus", () => {
    for (const file of [
      MIGRATION_PATH,
      "lib/jarvis/goals/mutations/move-goal-level.ts",
      "lib/jarvis/goals/mutations/move-goal-task.ts",
      "app/goals/actions.ts",
      "components/jarvis/goals/level-roadmap.tsx",
      "components/jarvis/goals/goal-task-row.tsx",
    ]) {
      expect(readSource(file)).not.toContain("current_focus");
    }
  });

  it("migration uses three-step sentinel swap, not CASE UPDATE", () => {
    expect(migration).not.toMatch(/SET position = CASE/i);

    const levelBody = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.move_jarvis_goal_level"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.move_jarvis_goal_task"),
    );
    const taskBody = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.move_jarvis_goal_task"),
    );

    expect(levelBody.match(/UPDATE public\.jarvis_goal_levels/g)?.length).toBe(3);
    expect(taskBody.match(/UPDATE public\.tasks/g)?.length).toBe(3);
    expect(levelBody).toContain("v_temporary_position := v_max_position + 10");
    expect(taskBody).toContain("v_temporary_position := v_max_position + 10");
  });

  it("migration checks overflow before +10", () => {
    expect(migration).toContain("2147483637");
    expect(migration).toContain("'code', 'position_overflow'");
  });

  it("migration level reorder reconciles and task reorder does not", () => {
    const levelBody = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.move_jarvis_goal_level"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.move_jarvis_goal_task"),
    );
    const taskBody = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.move_jarvis_goal_task"),
    );

    expect(levelBody).toContain("jarvis_internal.reconcile_jarvis_goal_completion");
    expect(taskBody).not.toContain("jarvis_internal.reconcile_jarvis_goal_completion");
  });

  it("migration task reorder uses NOWAIT before position UPDATE", () => {
    const taskBody = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.move_jarvis_goal_task"),
    );

    const nowaitPos = taskBody.indexOf("FOR UPDATE NOWAIT");
    const firstUpdatePos = taskBody.indexOf("UPDATE public.tasks");

    expect(nowaitPos).toBeGreaterThan(-1);
    expect(nowaitPos).toBeLessThan(firstUpdatePos);
    expect(taskBody).toContain("WHEN lock_not_available THEN");
    expect(taskBody).toContain("'code', 'task_busy'");
  });

  it("level RPC resolves identity pre-lock but refreshes target position after goal lock", () => {
    const levelBody = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.move_jarvis_goal_level"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.move_jarvis_goal_task"),
    );

    const initialLookup = levelBody.slice(
      levelBody.indexOf("SELECT id, goal_id"),
      levelBody.indexOf("IF NOT FOUND", levelBody.indexOf("SELECT id, goal_id")),
    );
    expect(initialLookup).not.toContain("position");

    const goalLockPos = levelBody.indexOf(
      "WHERE id = v_resolved_goal_id\n    AND user_id = v_user_id\n  FOR UPDATE",
    );
    const targetPositionLockPos = levelBody.indexOf(
      "WHERE gl.id = v_target_id\n    AND gl.user_id = v_user_id\n    AND gl.goal_id = v_resolved_goal_id\n  FOR UPDATE",
    );
    const adjacencyPos = levelBody.indexOf("AND gl.position < v_target_position");

    expect(goalLockPos).toBeGreaterThan(-1);
    expect(targetPositionLockPos).toBeGreaterThan(goalLockPos);
    expect(adjacencyPos).toBeGreaterThan(targetPositionLockPos);
  });

  it("task RPC refreshes target position after goal and level locks before adjacency", () => {
    const taskBody = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.move_jarvis_goal_task"),
    );

    const initialLookup = taskBody.slice(
      taskBody.indexOf("SELECT t.id, t.goal_id, t.goal_level_id"),
      taskBody.indexOf("IF NOT FOUND", taskBody.indexOf("SELECT t.id, t.goal_id, t.goal_level_id")),
    );
    expect(initialLookup).not.toContain("position");

    const goalLockPos = taskBody.indexOf(
      "WHERE id = v_resolved_goal_id\n    AND user_id = v_user_id\n  FOR UPDATE",
    );
    const levelLockPos = taskBody.indexOf(
      "WHERE id = v_resolved_level_id\n    AND user_id = v_user_id\n  FOR UPDATE",
    );
    const targetPositionRefreshPos = taskBody.indexOf(
      "SELECT t.position\n  INTO v_target_position\n  FROM public.tasks t",
    );
    const adjacencyPos = taskBody.indexOf("AND t.position < v_target_position");

    expect(goalLockPos).toBeGreaterThan(-1);
    expect(levelLockPos).toBeGreaterThan(goalLockPos);
    expect(targetPositionRefreshPos).toBeGreaterThan(levelLockPos);
    expect(adjacencyPos).toBeGreaterThan(targetPositionRefreshPos);
  });

  it("documents stale-position race: adjacency must use post-lock refreshed target position", () => {
    const levelBody = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.move_jarvis_goal_level"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.move_jarvis_goal_task"),
    );

    const boundaryPos = levelBody.indexOf("'code', 'already_first'");
    const targetLockPos = levelBody.indexOf(
      "WHERE gl.id = v_target_id\n    AND gl.user_id = v_user_id\n    AND gl.goal_id = v_resolved_goal_id\n  FOR UPDATE",
    );

    expect(boundaryPos).toBeGreaterThan(targetLockPos);
    expect(levelBody.indexOf("already_last")).toBeGreaterThan(targetLockPos);
  });

  it("migration defines hardened grants for both RPCs", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.move_jarvis_goal_level");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.move_jarvis_goal_task");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.move_jarvis_goal_level");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.move_jarvis_goal_task");
    expect(migration).not.toContain("GRANT EXECUTE ON FUNCTION jarvis_internal.reconcile");
  });

  it("actions revalidate goal pages after move", () => {
    const actionsSource = readSource("app/goals/actions.ts");

    expect(actionsSource).toMatch(/moveGoalLevel[\s\S]*revalidateGoalPages/);
    expect(actionsSource).toMatch(/moveGoalTask[\s\S]*revalidateGoalPages/);
    expect(actionsSource).toContain('revalidatePath("/tasks")');
  });

  it("completed collapsed card hides reorder controls", () => {
    const html = renderToStaticMarkup(
      createElement(GoalCard, {
        goal: sampleGoal({ status: "completed", progressPercent: 100 }),
        showTodayPriority: false,
      }),
    );

    expect(html).toContain("goals-card--collapsed");
    expect(html).not.toContain("Move up");
  });
});
