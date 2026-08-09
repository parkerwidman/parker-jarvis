import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { GoalTaskRow } from "@/components/jarvis/goals/goal-task-row";
import { GoalCard } from "@/components/jarvis/goals/goal-card";
import type { GoalTaskView, GoalView } from "@/lib/jarvis/goals/types";

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
    notes: null,
    blockedAt: null,
    blockedReason: null,
    isBlocked: false,
    isDone: false,
    isActionable: true,
    ...overrides,
  };
}

function sampleGoal(overrides: Partial<GoalView> = {}): GoalView {
  return {
    id: "goal-1",
    title: "Launch beta",
    description: "Ship the first beta release.",
    domain: "personal",
    status: "completed",
    sortOrder: 0,
    completedAt: "2026-08-08T00:00:00.000Z",
    progressPercent: 100,
    isTodayPriority: false,
    levels: [
      {
        id: "level-1",
        name: "Foundation",
        position: 10,
        state: "complete",
        tasks: [
          sampleTask({
            status: "done",
            isDone: true,
            isActionable: false,
            notes: "Done note",
          }),
        ],
      },
    ],
    ...overrides,
  };
}

vi.mock("@/app/goals/actions", () => ({
  setGoalTaskCompletion: vi.fn(),
  setGoalTaskNotes: vi.fn(),
  setGoalTaskBlockState: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("Jarvis goals phase 1B2B task metadata", () => {
  const rowProps = { goalStatus: "active" as const, levelTaskCount: 2 };

  it("shows note controls but not block controls outside edit mode", () => {
    const html = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: sampleTask({ notes: null }),
        levelState: "current",
        ...rowProps,
      }),
    );

    expect(html).toContain("Add note");
    expect(html).not.toContain(">Block<");
  });

  it("shows edit note outside edit mode and block controls only while editing", () => {
    const blockedTask = sampleTask({
      isBlocked: true,
      blockedAt: "2026-08-08T00:00:00.000Z",
      blockedReason: "Waiting on review",
      notes: null,
    });
    const normalHtml = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: blockedTask,
        levelState: "current",
        ...rowProps,
      }),
    );
    const editingHtml = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: blockedTask,
        levelState: "current",
        isEditing: true,
        ...rowProps,
      }),
    );

    expect(normalHtml).toContain("Blocked");
    expect(normalHtml).toContain("Waiting on review");
    expect(normalHtml).toContain("Add note");
    expect(normalHtml).not.toContain("Edit blocker");
    expect(normalHtml).not.toContain("Unblock");
    expect(editingHtml).toContain("Edit blocker");
    expect(editingHtml).toContain("Unblock");
  });

  it("allows note editing but not new blocking on completed unblocked tasks", () => {
    const html = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: sampleTask({
          status: "done",
          isDone: true,
          isActionable: false,
          notes: "Shipped",
        }),
        levelState: "complete",
        ...rowProps,
      }),
    );

    expect(html).toContain("Edit note");
    expect(html).not.toContain(">Block<");
  });

  it("keeps note controls available on locked unfinished tasks outside edit mode", () => {
    const html = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: sampleTask({ notes: null }),
        levelState: "locked",
        ...rowProps,
      }),
    );

    expect(html).toContain("Add note");
    expect(html).not.toContain(">Block<");
    expect(html).toContain("disabled");
  });

  it("A. server actions authenticate before metadata mutation", () => {
    const actionsSource = readSource("app/goals/actions.ts");

    expect(actionsSource).toMatch(
      /setGoalTaskNotes[\s\S]*requireAuthenticatedUser[\s\S]*setJarvisGoalTaskNotes/,
    );
    expect(actionsSource).toMatch(
      /setGoalTaskBlockState[\s\S]*requireAuthenticatedUser[\s\S]*setJarvisGoalTaskBlockState/,
    );
  });

  it("K. passes authenticated userId server-side only", () => {
    const actionsSource = readSource("app/goals/actions.ts");
    const notesSource = readSource("lib/jarvis/goals/mutations/set-goal-task-notes.ts");
    const blockSource = readSource("lib/jarvis/goals/mutations/set-goal-task-block-state.ts");
    const taskRowSource = readSource("components/jarvis/goals/goal-task-row.tsx");

    expect(actionsSource).toContain("setJarvisGoalTaskNotes(supabase, userId, taskId, notes)");
    expect(actionsSource).toContain(
      "setJarvisGoalTaskBlockState(\n    supabase,\n    userId,\n    taskId,\n    blocked,\n    reason,\n  )",
    );
    expect(notesSource).toContain("parseAuthenticatedUserId(userId)");
    expect(blockSource).toContain("parseAuthenticatedUserId(userId)");
    expect(taskRowSource).toContain("setGoalTaskNotes(task.id, noteDraft)");
    expect(taskRowSource).not.toContain("userId");
    expect(actionsSource).toMatch(/export async function setGoalTaskNotes\(\s*taskId: unknown,\s*notes: unknown/);
    expect(actionsSource).toMatch(
      /export async function setGoalTaskBlockState\(\s*taskId: unknown,\s*blocked: unknown,\s*reason: unknown/,
    );
  });

  it("AF. metadata actions only pass task id and edited values from client", () => {
    const taskRowSource = readSource("components/jarvis/goals/goal-task-row.tsx");
    const actionsSource = readSource("app/goals/actions.ts");
    const notesSource = readSource("lib/jarvis/goals/mutations/set-goal-task-notes.ts");
    const blockSource = readSource("lib/jarvis/goals/mutations/set-goal-task-block-state.ts");

    expect(taskRowSource).toContain("setGoalTaskNotes(task.id, noteDraft)");
    expect(taskRowSource).toContain("setGoalTaskBlockState(task.id, true, blockReasonDraft)");
    expect(taskRowSource).toContain("setGoalTaskBlockState(task.id, false, null)");
    expect(actionsSource).toContain("setJarvisGoalTaskNotes(supabase, userId, taskId, notes)");
    expect(notesSource).toContain('.eq("user_id", parsedUserId)');
    expect(blockSource).toContain('.eq("user_id", parsedUserId)');
    expect(notesSource).not.toContain(".rpc(");
    expect(blockSource).not.toContain(".rpc(");
  });

  it("AH. metadata mutations do not call goal completion reconciliation", () => {
    const notesSource = readSource("lib/jarvis/goals/mutations/set-goal-task-notes.ts");
    const blockSource = readSource("lib/jarvis/goals/mutations/set-goal-task-block-state.ts");

    for (const source of [notesSource, blockSource]) {
      expect(source).not.toContain("set_jarvis_goal_task_completion");
      expect(source).not.toContain("reconcile_jarvis_goal_completion");
      expect(source).not.toContain("jarvis_goals");
      expect(source).not.toContain("today_priority_goal_id");
      expect(source).not.toContain("current_focus");
    }
  });

  it("disables completion while a metadata editor is open", () => {
    const source = readSource("components/jarvis/goals/goal-task-row.tsx");

    expect(source).toContain("editorMode === \"none\"");
  });

  it("AJ. completed goal cards still collapse by default", () => {
    const html = renderToStaticMarkup(
      createElement(GoalCard, {
        goal: sampleGoal(),
        showTodayPriority: false,
      }),
    );

    expect(html).toContain("goals-card--collapsed");
    expect(html).not.toContain("goals-roadmap");
    expect(html).toContain("Expand");
  });
});
