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
  "supabase/migrations/20260809030000_add_jarvis_goal_level_structural_rpcs.sql";

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
    tasks: [sampleTask(), sampleTask({ id: "task-2", title: "Ship build" })],
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
    levels: [sampleLevel()],
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
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("Jarvis goals phase 1B2E level structural editing", () => {
  const migration = readFileSync(resolve(ROOT, MIGRATION_PATH), "utf8");

  it("BK. active goal shows Add level while editing", () => {
    const html = renderToStaticMarkup(
      createElement(LevelRoadmap, {
        goalId: "goal-1",
        goalStatus: "active",
        isEditing: true,
        levels: [
          sampleLevel({ state: "current" }),
          sampleLevel({ id: "level-2", name: "Launch", state: "locked", position: 20 }),
        ],
      }),
    );

    expect(html).toContain("Add level");
  });

  it("BL. completed goal does NOT show Add level", () => {
    const html = renderToStaticMarkup(
      createElement(LevelRoadmap, {
        goalId: "goal-1",
        goalStatus: "completed",
        levels: [sampleLevel({ state: "complete" })],
      }),
    );

    expect(html).not.toContain("Add level");
  });

  it("BM/BN. active levels show Edit level and Delete level while editing", () => {
    const html = renderToStaticMarkup(
      createElement(LevelRoadmap, {
        goalId: "goal-1",
        goalStatus: "active",
        isEditing: true,
        levels: [sampleLevel({ state: "current" })],
      }),
    );

    expect(html).toContain("Edit level");
    expect(html).toContain("Delete level");
  });

  it("BO. locked active level shows Edit and Delete while editing", () => {
    const html = renderToStaticMarkup(
      createElement(LevelRoadmap, {
        goalId: "goal-1",
        goalStatus: "active",
        isEditing: true,
        levels: [sampleLevel({ state: "locked" })],
      }),
    );

    expect(html).toContain("Edit level");
    expect(html).toContain("Delete level");
  });

  it("BP/BQ. completed goal level shows Edit only while editing", () => {
    const html = renderToStaticMarkup(
      createElement(LevelRoadmap, {
        goalId: "goal-1",
        goalStatus: "completed",
        isEditing: true,
        levels: [sampleLevel({ state: "complete" })],
      }),
    );

    expect(html).toContain("Edit level");
    expect(html).not.toContain("Delete level");
  });

  it("BR. Add level requires level name and first task inputs", () => {
    const source = readSource("components/jarvis/goals/level-roadmap.tsx");

    expect(source).toContain('placeholder="Level name"');
    expect(source).toContain('placeholder="First task"');
  });

  it("BS. delete confirmation displays task count", () => {
    const html = renderToStaticMarkup(
      createElement(LevelRoadmap, {
        goalId: "goal-1",
        goalStatus: "active",
        levels: [sampleLevel({ tasks: [sampleTask(), sampleTask({ id: "task-2" }), sampleTask({ id: "task-3" })] })],
      }),
    );

    expect(sourceSafeDeletePrompt(html)).toBe(true);
  });

  it("BT. no reorder controls added", () => {
    for (const file of [
      "components/jarvis/goals/level-roadmap.tsx",
      "components/jarvis/goals/goal-card.tsx",
    ]) {
      expect(readSource(file)).not.toMatch(/reorder|drag/i);
    }
  });

  it("BU/BV. retains note and priority controls outside edit mode", () => {
    const html = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: sampleTask({ notes: null }),
        levelState: "current",
        goalStatus: "active",
        levelTaskCount: 2,
      }),
    );

    expect(html).toContain("Add note");
    expect(html).not.toContain("Edit task");

    const cardHtml = renderToStaticMarkup(
      createElement(GoalCard, {
        goal: sampleGoal({ isCurrentPriority: true, isTodayPriority: true }),
        showCurrentPriority: true,
      }),
    );

    expect(cardHtml).toContain("PRIORITY");
  });

  it("BW. completed collapsed card hides structural roadmap body", () => {
    const html = renderToStaticMarkup(
      createElement(GoalCard, {
        goal: sampleGoal({ status: "completed", progressPercent: 100 }),
        showTodayPriority: false,
      }),
    );

    expect(html).toContain("goals-card--collapsed");
    expect(html).not.toContain("Add level");
  });

  it("BJ/AQ. level structural code does not touch current_focus", () => {
    for (const file of [
      "lib/jarvis/goals/mutations/add-goal-level.ts",
      "lib/jarvis/goals/mutations/delete-goal-level.ts",
      "lib/jarvis/goals/mutations/edit-goal-level-name.ts",
      MIGRATION_PATH,
      "app/goals/actions.ts",
      "components/jarvis/goals/level-roadmap.tsx",
    ]) {
      expect(readSource(file)).not.toContain("current_focus");
    }
  });

  it("revalidates goals routes and /tasks for add/delete/edit level", () => {
    const actionsSource = readSource("app/goals/actions.ts");

    expect(actionsSource).toContain("revalidateGoalPages");
    expect(actionsSource).toMatch(/addGoalLevel[\s\S]*revalidateGoalPages/);
    expect(actionsSource).toMatch(/editGoalLevelName[\s\S]*revalidateGoalPages/);
    expect(actionsSource).toMatch(/deleteGoalLevel[\s\S]*revalidateGoalPages/);
  });

  it("migration defines both level structural RPCs with hardened grants", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.add_jarvis_goal_level");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.delete_jarvis_goal_level");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path TO ''");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.add_jarvis_goal_level");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.delete_jarvis_goal_level");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.add_jarvis_goal_level");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.delete_jarvis_goal_level");
    expect(migration).not.toContain("GRANT EXECUTE ON FUNCTION jarvis_internal.reconcile");
  });

  it("migration rejects completed goals for add/delete level", () => {
    expect(migration).toContain("goal_completed");
    expect(migration).toMatch(/IF v_goal_status = 'completed'/g);
  });

  it("migration uses goal FOR UPDATE before append MAX+10 for add level", () => {
    const addBody = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.add_jarvis_goal_level"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.delete_jarvis_goal_level"),
    );

    expect(addBody).toContain("COALESCE(MAX(gl.position), 0) + 10");
    expect(addBody).toContain("WHERE id = p_goal_id\n    AND user_id = v_user_id\n  FOR UPDATE");
    expect(addBody).toContain("jarvis_internal.jarvis_goal_has_malformed_tasks");
  });

  it("migration keeps delete lock order goal → level with explicit task delete", () => {
    const deleteBody = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.delete_jarvis_goal_level"),
    );

    const goalLockPos = deleteBody.indexOf(
      "WHERE id = v_resolved_goal_id\n    AND user_id = v_user_id\n  FOR UPDATE",
    );
    const levelLockPos = deleteBody.indexOf(
      "AND goal_id = v_resolved_goal_id\n  FOR UPDATE",
    );
    const taskNowaitPos = deleteBody.indexOf("FOR UPDATE NOWAIT");
    const taskDeleteIndex = deleteBody.indexOf("DELETE FROM public.tasks");

    expect(goalLockPos).toBeGreaterThan(-1);
    expect(levelLockPos).toBeGreaterThan(goalLockPos);
    expect(taskNowaitPos).toBeGreaterThan(levelLockPos);
    expect(taskNowaitPos).toBeLessThan(taskDeleteIndex);
    expect(levelLockPos).toBeLessThan(taskDeleteIndex);
    expect(deleteBody).toContain("last_level_in_goal");
    expect(deleteBody).toContain("GET DIAGNOSTICS v_deleted_task_count = ROW_COUNT");
  });

  it("migration handles attached-task lock contention as level_busy without deleting", () => {
    const deleteBody = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.delete_jarvis_goal_level"),
    );

    expect(deleteBody).toContain("WHEN lock_not_available THEN");
    expect(deleteBody).toContain("'code', 'level_busy'");

    const busyReturnPos = deleteBody.indexOf("'code', 'level_busy'");
    const taskDeletePos = deleteBody.indexOf("DELETE FROM public.tasks");
    const levelDeletePos = deleteBody.indexOf("DELETE FROM public.jarvis_goal_levels");
    const reconcilePos = deleteBody.indexOf(
      "PERFORM jarvis_internal.reconcile_jarvis_goal_completion",
    );

    expect(busyReturnPos).toBeLessThan(taskDeletePos);
    expect(taskDeletePos).toBeLessThan(levelDeletePos);
    expect(levelDeletePos).toBeLessThan(reconcilePos);
  });

  it("add-level RPC remains unchanged in migration", () => {
    const addBody = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.add_jarvis_goal_level"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.delete_jarvis_goal_level"),
    );

    expect(addBody).not.toContain("FOR UPDATE NOWAIT");
    expect(addBody).not.toContain("level_busy");
  });

  it("migration calls internal reconcile without exposing it", () => {
    expect(migration).toContain(
      "PERFORM jarvis_internal.reconcile_jarvis_goal_completion",
    );
    expect(migration).not.toContain(
      "GRANT EXECUTE ON FUNCTION jarvis_internal.reconcile_jarvis_goal_completion",
    );
  });

  it("edit level name uses RLS update not RPC", () => {
    const editSource = readSource("lib/jarvis/goals/mutations/edit-goal-level-name.ts");

    expect(editSource).toContain('.from("jarvis_goal_levels")');
    expect(editSource).not.toContain(".rpc(");
  });
});

function sourceSafeDeletePrompt(html: string): boolean {
  const source = readSource("components/jarvis/goals/level-roadmap.tsx");
  return source.includes("Delete this level and all") && source.includes("level.tasks.length");
}
