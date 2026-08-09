import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
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

describe("Jarvis goals phase 1B1 builder UI", () => {
  it("W. renders the shared builder on each goals page", () => {
    for (const goalType of ["short_term", "three_month", "long_term"] as const) {
      const html = renderToStaticMarkup(
        createElement(GoalsPage, {
          data: sampleData(goalType),
          goalType,
        }),
      );

      expect(html).toContain("goals-builder");
      expect(html).toContain("Publish goal");
      expect(html).toContain(GOAL_PAGE_CONFIG[goalType].title);
    }
  });

  it("renders route-specific builder headings without a goal type picker", () => {
    for (const goalType of ["short_term", "three_month", "long_term"] as const) {
      const html = renderToStaticMarkup(
        createElement(GoalsPage, {
          data: sampleData(goalType),
          goalType,
        }),
      );

      if (goalType === "short_term") {
        expect(html).toContain("Add a short term goal");
      }
      if (goalType === "three_month") {
        expect(html).toContain("Add a 3 month goal");
      }
      if (goalType === "long_term") {
        expect(html).toContain("Add a long term goal");
      }
    }

    const html = renderToStaticMarkup(
      createElement(GoalsPage, {
        data: sampleData("short_term"),
        goalType: "short_term",
      }),
    );
    expect(html).not.toContain("goal type");
    expect(html).not.toContain("Goal type");
  });

  it("Y. keeps the removed board preview section absent", () => {
    const sources = [
      "components/jarvis/goals/goals-page.tsx",
      "components/jarvis/goals/goal-builder.tsx",
      "app/goals/actions.ts",
      "lib/jarvis/goals/create-goal.ts",
    ].map(readSource);

    for (const source of sources) {
      expect(source).not.toContain("How this feeds your board");
    }
  });

  it("V. avoids Command Center, Morning Brief, Tasks, and priority mutations", () => {
    const sources = [
      "app/goals/actions.ts",
      "lib/jarvis/goals/create-goal.ts",
      "components/jarvis/goals/goal-builder.tsx",
      "supabase/migrations/20260808200000_add_jarvis_goal_create_rpc.sql",
    ].map(readSource);

    for (const source of sources) {
      expect(source).not.toMatch(/command[- ]center/i);
      expect(source).not.toMatch(/morning brief/i);
      expect(source).not.toMatch(/today_priority_goal_id/i);
      expect(source).not.toMatch(/current_focus/i);
      expect(source).not.toContain("completeTask");
    }
  });
});

describe("Jarvis goals publish actions", () => {
  it("A-C. exposes route-scoped publish actions with fixed goal types", async () => {
    const { publishShortTermGoal, publishThreeMonthGoal, publishLongTermGoal } = await import(
      "@/app/goals/actions"
    );

    expect(readSource("app/goals/actions.ts")).toContain('publishJarvisGoal("short_term"');
    expect(readSource("app/goals/actions.ts")).toContain('publishJarvisGoal("three_month"');
    expect(readSource("app/goals/actions.ts")).toContain('publishJarvisGoal("long_term"');
    expect(typeof publishShortTermGoal).toBe("function");
    expect(typeof publishThreeMonthGoal).toBe("function");
    expect(typeof publishLongTermGoal).toBe("function");
  });
});
