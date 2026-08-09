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

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function sampleTask(overrides: Partial<GoalTaskView> = {}): GoalTaskView {
  return {
    id: "task-1",
    title: "Write release notes",
    status: "todo",
    position: 10,
    notes: "Existing note",
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
      sampleTask({ id: "task-2", title: "Ship build", position: 20, notes: null }),
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

describe("Jarvis goals edit mode UI", () => {
  it("active goal card shows Edit goal toggle at bottom-right by default", () => {
    const html = renderToStaticMarkup(
      createElement(GoalCard, {
        goal: sampleGoal(),
        showTodayPriority: false,
      }),
    );

    expect(html).toContain("Edit goal");
    expect(html).toContain("goals-card-edit-toggle");
    expect(html).not.toContain("Done editing");
  });

  it("completed goal edit toggle is available when roadmap body is visible", () => {
    const cardSource = readSource("components/jarvis/goals/goal-card.tsx");

    expect(cardSource).toContain("const showGoalBody = !isCompleted || expanded");
    expect(cardSource).toContain("const showEditToggle = showGoalBody");
    expect(cardSource).not.toMatch(/\{isActive \?\s*\(\s*<div className="goals-card-footer"/);
  });

  it("completed collapsed card hides edit toggle until expanded", () => {
    const html = renderToStaticMarkup(
      createElement(GoalCard, {
        goal: sampleGoal({ status: "completed", progressPercent: 100 }),
        showTodayPriority: false,
      }),
    );

    expect(html).toContain("goals-card--collapsed");
    expect(html).not.toContain("goals-card-edit-toggle");
    expect(html).not.toContain("Edit goal");
  });

  it("completed goal normal mode hides historical correction controls", () => {
    const levelHtml = renderToStaticMarkup(
      createElement(LevelRoadmap, {
        goalId: "goal-1",
        goalStatus: "completed",
        levels: [sampleLevel({ state: "complete" })],
      }),
    );
    const taskHtml = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: sampleTask({ status: "done", isDone: true, isActionable: false }),
        levelState: "complete",
        goalStatus: "completed",
        levelTaskCount: 2,
      }),
    );

    expect(levelHtml).not.toContain("Edit level");
    expect(taskHtml).not.toContain("Edit task");
    expect(levelHtml).not.toContain("Add task");
    expect(levelHtml).not.toContain("Move up");
    expect(taskHtml).not.toContain("Delete");
  });

  it("goal card toggles local isEditing state via Edit goal button", () => {
    const cardSource = readSource("components/jarvis/goals/goal-card.tsx");

    expect(cardSource).toContain('onClick={() => setIsEditing((value) => !value)}');
    expect(cardSource).toContain('isEditing ? "Done editing" : "Edit goal"');
    expect(cardSource).toContain("aria-pressed={isEditing}");
  });

  it("completed edit mode exposes Edit task and Edit level only where rules allow", () => {
    const levelHtml = renderToStaticMarkup(
      createElement(LevelRoadmap, {
        goalId: "goal-1",
        goalStatus: "completed",
        isEditing: true,
        levels: [sampleLevel({ state: "complete" })],
      }),
    );
    const taskHtml = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: sampleTask({ status: "done", isDone: true, isActionable: false }),
        levelState: "complete",
        goalStatus: "completed",
        levelTaskCount: 2,
        isEditing: true,
      }),
    );

    expect(levelHtml).toContain("Edit level");
    expect(taskHtml).toContain("Edit task");
    expect(levelHtml).not.toContain("Delete level");
    expect(taskHtml).not.toContain("Delete");
    expect(levelHtml).not.toContain("Add task");
    expect(levelHtml).not.toContain("Add level");
    expect(levelHtml).not.toContain("Move up");
    expect(taskHtml).not.toContain("Move up");
  });

  it("done editing hides completed correction controls again", () => {
    const levelHtml = renderToStaticMarkup(
      createElement(LevelRoadmap, {
        goalId: "goal-1",
        goalStatus: "completed",
        isEditing: false,
        levels: [sampleLevel({ state: "complete" })],
      }),
    );
    const taskHtml = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: sampleTask({ status: "done", isDone: true, isActionable: false }),
        levelState: "complete",
        goalStatus: "completed",
        levelTaskCount: 2,
        isEditing: false,
      }),
    );

    expect(levelHtml).not.toContain("Edit level");
    expect(taskHtml).not.toContain("Edit task");
  });

  it("normal view hides structural level controls on active goals", () => {
    const html = renderToStaticMarkup(
      createElement(LevelRoadmap, {
        goalId: "goal-1",
        goalStatus: "active",
        levels: [sampleLevel(), sampleLevel({ id: "level-2", name: "Launch", position: 20, state: "locked" })],
      }),
    );

    expect(html).not.toContain("Add task");
    expect(html).not.toContain("Add level");
    expect(html).not.toContain("Edit level");
    expect(html).not.toContain("Delete level");
    expect(html).not.toContain("Move up");
  });

  it("active edit mode shows all currently legal structural controls", () => {
    const levelHtml = renderToStaticMarkup(
      createElement(LevelRoadmap, {
        goalId: "goal-1",
        goalStatus: "active",
        isEditing: true,
        levels: [sampleLevel(), sampleLevel({ id: "level-2", name: "Launch", position: 20, state: "locked" })],
      }),
    );
    const taskHtml = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: sampleTask({ notes: null }),
        levelState: "current",
        goalStatus: "active",
        levelTaskCount: 2,
        isEditing: true,
      }),
    );

    expect(levelHtml).toContain("Add task");
    expect(levelHtml).toContain("Add level");
    expect(levelHtml).toContain("Edit level");
    expect(levelHtml).toContain("Delete level");
    expect(levelHtml).toContain("Move up");
    expect(taskHtml).toContain("Edit task");
    expect(taskHtml).toContain("Delete");
    expect(taskHtml).toContain("Move up");
    expect(taskHtml).toContain("Block");
  });

  it("normal view keeps completion, notes, and subtle note action", () => {
    const html = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: sampleTask(),
        levelState: "current",
        goalStatus: "active",
        levelTaskCount: 2,
      }),
    );

    expect(html).toContain("goals-task-check");
    expect(html).toContain("Existing note");
    expect(html).toContain("Edit note");
    expect(html).toContain("goals-task-action--subtle");
    expect(html).not.toContain("Edit task");
    expect(html).not.toContain("Delete");
    expect(html).not.toContain("Move up");
    expect(html).not.toContain(">Block<");
  });

  it("normal view hides block controls but keeps blocked reason visible", () => {
    const html = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: sampleTask({
          notes: null,
          isBlocked: true,
          blockedAt: "2026-08-08T00:00:00.000Z",
          blockedReason: "Waiting on review",
        }),
        levelState: "current",
        goalStatus: "active",
        levelTaskCount: 2,
      }),
    );

    expect(html).toContain("Blocked");
    expect(html).toContain("Waiting on review");
    expect(html).not.toContain("Edit blocker");
    expect(html).not.toContain("Unblock");
  });

  it("active edit mode shows block controls for blocked tasks", () => {
    const html = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: sampleTask({
          notes: null,
          isBlocked: true,
          blockedAt: "2026-08-08T00:00:00.000Z",
          blockedReason: "Waiting on review",
        }),
        levelState: "current",
        goalStatus: "active",
        levelTaskCount: 2,
        isEditing: true,
      }),
    );

    expect(html).toContain("Edit blocker");
    expect(html).toContain("Unblock");
  });

  it("each goal card keeps independent isEditing state", () => {
    const cardSource = readSource("components/jarvis/goals/goal-card.tsx");

    expect(cardSource).toContain("const [isEditing, setIsEditing] = useState(false)");
    expect(cardSource).toContain("isEditing={isEditing}");
    expect(cardSource).not.toContain("GoalsEditModeProvider");
  });

  it("UI legality mirrors existing canMove/canDelete/canAdd goalStatus rules", () => {
    const roadmapSource = readSource("components/jarvis/goals/level-roadmap.tsx");
    const taskRowSource = readSource("components/jarvis/goals/goal-task-row.tsx");

    expect(roadmapSource).toContain('const canAddTasks = goalStatus === "active"');
    expect(roadmapSource).toContain('const canAddLevels = goalStatus === "active"');
    expect(roadmapSource).toContain('const canDeleteLevels = goalStatus === "active"');
    expect(roadmapSource).toContain('const canMoveLevels = goalStatus === "active"');
    expect(taskRowSource).toContain('const isActiveGoal = goalStatus === "active"');
    expect(taskRowSource).toContain("const canMoveTasks = isActiveGoal");
    expect(taskRowSource).toContain("const canDelete = isActiveGoal && levelTaskCount > 1");
  });

  it("does not change server actions or RPCs for edit mode", () => {
    const actionsSource = readSource("app/goals/actions.ts");

    expect(actionsSource).not.toContain("editMode");
    expect(actionsSource).not.toContain("isEditing");
  });
});
