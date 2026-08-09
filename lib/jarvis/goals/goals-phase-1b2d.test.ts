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
  "supabase/migrations/20260809020000_add_jarvis_goal_task_structural_rpcs.sql";

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
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("Jarvis goals phase 1B2D task structural editing", () => {
  const migration = readFileSync(resolve(ROOT, MIGRATION_PATH), "utf8");

  it("BG/BH. active and locked levels show Add task", () => {
    const html = renderToStaticMarkup(
      createElement(LevelRoadmap, {
        goalStatus: "active",
        levels: [
          sampleLevel({ state: "current" }),
          sampleLevel({ id: "level-2", name: "Launch", state: "locked", position: 20 }),
        ],
      }),
    );

    expect(html.match(/Add task/g)?.length).toBe(2);
  });

  it("BI. completed goal levels do NOT show Add task", () => {
    const html = renderToStaticMarkup(
      createElement(LevelRoadmap, {
        goalStatus: "completed",
        levels: [sampleLevel({ state: "complete" })],
      }),
    );

    expect(html).not.toContain("Add task");
  });

  it("BJ/BK. active task shows Edit and Delete", () => {
    const html = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: sampleTask(),
        levelState: "current",
        goalStatus: "active",
        levelTaskCount: 2,
      }),
    );

    expect(html).toContain("Edit task");
    expect(html).toContain("Delete");
  });

  it("BL/BM. completed goal task shows Edit but not Delete", () => {
    const html = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: sampleTask({ status: "done", isDone: true, isActionable: false }),
        levelState: "complete",
        goalStatus: "completed",
        levelTaskCount: 2,
      }),
    );

    expect(html).toContain("Edit task");
    expect(html).not.toContain(">Delete<");
  });

  it("BN. delete uses inline confirmation prompt text", () => {
    const source = readSource("components/jarvis/goals/goal-task-row.tsx");

    expect(source).toContain('editorMode === "deleteConfirm"');
    expect(source).toContain("Delete this task?");
    expect(source).not.toContain("window.confirm");
  });

  it("BO. no reorder controls added", () => {
    for (const file of [
      "components/jarvis/goals/goal-task-row.tsx",
      "components/jarvis/goals/level-roadmap.tsx",
      "components/jarvis/goals/goal-card.tsx",
    ]) {
      expect(readSource(file)).not.toMatch(/reorder|drag/i);
    }
  });

  it("BP/BQ/BR. retains note, blocker, and completion controls", () => {
    const html = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: sampleTask(),
        levelState: "current",
        goalStatus: "active",
        levelTaskCount: 2,
      }),
    );

    expect(html).toContain("Add note");
    expect(html).toContain("Block");
    expect(html).toContain("goals-task-check");
  });

  it("completed collapsed card hides structural roadmap body", () => {
    const html = renderToStaticMarkup(
      createElement(GoalCard, {
        goal: sampleGoal({ status: "completed", progressPercent: 100 }),
        showTodayPriority: false,
      }),
    );

    expect(html).toContain("goals-card--collapsed");
    expect(html).not.toContain("Add task");
    expect(html).not.toContain("Edit task");
  });

  it("AN/BF. structural code does not touch current_focus", () => {
    for (const file of [
      "lib/jarvis/goals/mutations/add-goal-task.ts",
      "lib/jarvis/goals/mutations/delete-goal-task.ts",
      "lib/jarvis/goals/mutations/edit-goal-task-title.ts",
      MIGRATION_PATH,
      "app/goals/actions.ts",
    ]) {
      expect(readSource(file)).not.toContain("current_focus");
    }
  });

  it("revalidates goals routes and /tasks", () => {
    const actionsSource = readSource("app/goals/actions.ts");

    expect(actionsSource).toContain('revalidatePath("/tasks")');
    expect(actionsSource).toMatch(
      /addGoalTask[\s\S]*revalidateGoalPages/,
    );
    expect(actionsSource).toMatch(
      /editGoalTaskTitle[\s\S]*revalidateGoalPages/,
    );
    expect(actionsSource).toMatch(
      /deleteGoalTask[\s\S]*revalidateGoalPages/,
    );
  });

  it("migration defines both structural RPCs with hardened grants", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.add_jarvis_goal_task");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.delete_jarvis_goal_task");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path TO ''");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.add_jarvis_goal_task");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.delete_jarvis_goal_task");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.add_jarvis_goal_task");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.delete_jarvis_goal_task");
    expect(migration).not.toContain("GRANT EXECUTE ON FUNCTION jarvis_internal.reconcile");
  });

  it("migration rejects completed goals for add/delete", () => {
    expect(migration).toContain("goal_completed");
    expect(migration).toMatch(/IF v_goal_status = 'completed'/g);
  });

  it("migration uses append MAX+10 under level lock for add", () => {
    const addBody = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.add_jarvis_goal_task"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.delete_jarvis_goal_task"),
    );

    expect(addBody).toContain("COALESCE(MAX(t.position), 0) + 10");
    expect(addBody).toContain("v_resolved_goal_id");

    const initialLevelSelect = addBody.slice(
      addBody.indexOf("SELECT goal_id"),
      addBody.indexOf("IF NOT FOUND", addBody.indexOf("v_resolved_goal_id")),
    );
    expect(initialLevelSelect).not.toContain("FOR UPDATE");

    const goalLockPos = addBody.indexOf(
      "WHERE id = v_resolved_goal_id\n    AND user_id = v_user_id\n  FOR UPDATE",
    );
    const levelLockPos = addBody.indexOf(
      "AND goal_id = v_resolved_goal_id\n  FOR UPDATE",
    );

    expect(goalLockPos).toBeGreaterThan(-1);
    expect(levelLockPos).toBeGreaterThan(goalLockPos);
  });

  it("migration keeps delete lock order task → goal → level", () => {
    const deleteBody = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.delete_jarvis_goal_task"),
    );

    const taskLockIndex = deleteBody.indexOf("FROM public.tasks");
    const goalLockIndex = deleteBody.indexOf("FROM public.jarvis_goals");
    const levelLockIndex = deleteBody.indexOf("FROM public.jarvis_goal_levels");

    expect(taskLockIndex).toBeLessThan(goalLockIndex);
    expect(goalLockIndex).toBeLessThan(levelLockIndex);
  });

  it("migration enforces last_task_in_level on delete", () => {
    expect(migration).toContain("last_task_in_level");
    expect(migration).toContain("IF v_task_count <= 1");
  });

  it("migration calls internal reconcile without exposing it", () => {
    expect(migration).toContain(
      "PERFORM jarvis_internal.reconcile_jarvis_goal_completion",
    );
    expect(migration).not.toContain(
      "GRANT EXECUTE ON FUNCTION jarvis_internal.reconcile_jarvis_goal_completion",
    );
  });

  it("documents pre-existing generic completion bypass unchanged", () => {
    expect(readSource("lib/jarvis/goals/mutations/set-goal-task-completion.ts")).toContain(
      "still use generic",
    );
  });
});
