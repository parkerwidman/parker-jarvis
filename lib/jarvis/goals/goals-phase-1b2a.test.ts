import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { GoalTaskRow } from "@/components/jarvis/goals/goal-task-row";
import { GoalsPage } from "@/components/jarvis/goals/goals-page";
import { GOAL_PAGE_CONFIG, type GoalView, type GoalsPageData } from "@/lib/jarvis/goals/types";

const ROOT = resolve(import.meta.dirname, "../../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function sampleGoal(overrides: Partial<GoalView> = {}): GoalView {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Launch beta",
    description: "Ship the first beta release.",
    domain: "personal",
    status: "active",
    sortOrder: 0,
    completedAt: null,
    progressPercent: 0,
    isTodayPriority: false,
    levels: [
      {
        id: "level-1",
        name: "Foundation",
        position: 10,
        state: "current",
        tasks: [
          {
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
          },
        ],
      },
      {
        id: "level-2",
        name: "Launch",
        position: 20,
        state: "locked",
        tasks: [
          {
            id: "task-2",
            title: "Ship build",
            status: "todo",
            position: 10,
            notes: null,
            blockedAt: null,
            blockedReason: null,
            isBlocked: false,
            isDone: false,
            isActionable: false,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function sampleData(goalType: GoalsPageData["goalType"]): GoalsPageData {
  return {
    goalType,
    todayPriorityGoalId: null,
    goals: [sampleGoal()],
  };
}

vi.mock("@/app/goals/actions", () => ({
  publishShortTermGoal: vi.fn(),
  publishThreeMonthGoal: vi.fn(),
  publishLongTermGoal: vi.fn(),
  setGoalTaskCompletion: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("Jarvis goals phase 1B2A task completion UI", () => {
  it("renders interactive completion control for current-level tasks", () => {
    const html = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: sampleGoal().levels[0].tasks[0],
        levelState: "current",
      }),
    );

    expect(html).toContain("goals-task-check--interactive");
    expect(html).toContain('aria-label="Complete Write release notes"');
  });

  it("disables completion control for locked future-level tasks", () => {
    const html = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: sampleGoal().levels[1].tasks[0],
        levelState: "locked",
      }),
    );

    expect(html).toContain("disabled");
    expect(html).toContain("locked until earlier levels finish");
    expect(html).not.toContain("goals-task-check--interactive");
  });

  it("allows reopening completed tasks from prior levels", () => {
    const html = renderToStaticMarkup(
      createElement(GoalTaskRow, {
        task: {
          ...sampleGoal().levels[0].tasks[0],
          status: "done",
          isDone: true,
          isActionable: false,
        },
        levelState: "complete",
      }),
    );

    expect(html).toContain('aria-label="Reopen Write release notes"');
    expect(html).toContain("goals-task-check--interactive");
  });

  it("wires goal cards to the completion server action boundary", () => {
    const taskRowSource = readSource("components/jarvis/goals/goal-task-row.tsx");
    const actionsSource = readSource("app/goals/actions.ts");
    const mutationSource = readSource(
      "lib/jarvis/goals/mutations/set-goal-task-completion.ts",
    );

    expect(taskRowSource).toContain("setGoalTaskCompletion(task.id, !task.isDone)");
    expect(actionsSource).toContain("setGoalTaskCompletion(");
    expect(actionsSource).not.toMatch(/setGoalTaskCompletion\([\s\S]*goalType/);
    expect(actionsSource).toContain('revalidatePath("/")');
    expect(actionsSource).toContain("GOAL_PAGE_CONFIG");
    expect(mutationSource).toContain("set_jarvis_goal_task_completion");
    expect(mutationSource).toContain("Command Center");
    expect(mutationSource).toContain("/tasks");
  });

  it("does not add notes, priority, or archive controls in phase 1B2A", () => {
    const taskRowSource = readSource("components/jarvis/goals/goal-task-row.tsx");

    expect(taskRowSource).not.toMatch(/blocked_at|unblock|today_priority|archive/i);
  });

  it("still renders shared builder on goals pages", () => {
    for (const goalType of ["short_term", "three_month", "long_term"] as const) {
      const html = renderToStaticMarkup(
        createElement(GoalsPage, {
          data: sampleData(goalType),
          goalType,
        }),
      );

      expect(html).toContain("goals-builder");
      expect(html).toContain(GOAL_PAGE_CONFIG[goalType].title);
    }
  });
});
