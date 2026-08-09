import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { GoalCard } from "@/components/jarvis/goals/goal-card";
import { GoalsPage } from "@/components/jarvis/goals/goals-page";
import { GOAL_PAGE_CONFIG, type GoalView, type GoalsPageData } from "@/lib/jarvis/goals/types";

const ROOT = resolve(import.meta.dirname, "../../..");

const GOAL_ID = "11111111-1111-4111-8111-111111111111";

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function sampleGoal(overrides: Partial<GoalView> = {}): GoalView {
  return {
    id: GOAL_ID,
    title: "Launch beta",
    description: "Ship the first beta release.",
    domain: "personal",
    status: "active",
    sortOrder: 0,
    completedAt: null,
    progressPercent: 50,
    isTodayPriority: false,
    levels: [
      {
        id: "level-1",
        name: "Foundation",
        position: 1,
        state: "complete",
        tasks: [],
      },
      {
        id: "level-2",
        name: "Launch",
        position: 2,
        state: "current",
        tasks: [
          {
            id: "task-1",
            title: "Write release notes",
            status: "todo",
            position: 1,
            notes: "Include screenshots",
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

function sampleData(
  goalType: GoalsPageData["goalType"],
  overrides: Partial<GoalsPageData> = {},
): GoalsPageData {
  return {
    goalType,
    todayPriorityGoalId: null,
    goals: [sampleGoal()],
    ...overrides,
  };
}

describe("Jarvis goals phase 1A UI", () => {
  it("P. exposes today's priority styling only on short-term config", () => {
    expect(GOAL_PAGE_CONFIG.short_term.showTodayPriority).toBe(true);
    expect(GOAL_PAGE_CONFIG.three_month.showTodayPriority).toBe(false);
    expect(GOAL_PAGE_CONFIG.long_term.showTodayPriority).toBe(false);
  });

  it("O/Q. renders today's priority badge and collapsed completed goals by default", () => {
    const priorityHtml = renderToStaticMarkup(
      createElement(GoalCard, {
        goal: sampleGoal({ isTodayPriority: true }),
        showTodayPriority: true,
      }),
    );
    const completedHtml = renderToStaticMarkup(
      createElement(GoalCard, {
        goal: sampleGoal({ status: "completed", progressPercent: 100 }),
        showTodayPriority: false,
      }),
    );

    expect(priorityHtml).toContain("goals-priority-badge");
    expect(priorityHtml).toContain("goals-card--priority");
    expect(completedHtml).toContain("goals-card--collapsed");
    expect(completedHtml).toContain("Expand");
    expect(completedHtml).not.toContain("Foundation");
  });

  it("R. renders a polished empty state for the selected domain", () => {
    const html = renderToStaticMarkup(
      createElement(GoalsPage, {
        data: { goalType: "short_term", todayPriorityGoalId: null, goals: [] },
        goalType: "short_term",
      }),
    );

    expect(html).toContain("No Melusi short term goals yet.");
    expect(html).toContain("goals-empty");
  });

  it("S. does not include the removed board preview section", () => {
    const componentSources = [
      "components/jarvis/goals/goals-page.tsx",
      "components/jarvis/goals/goal-card.tsx",
      "components/jarvis/goals/level-roadmap.tsx",
      "components/jarvis/goals/goal-task-row.tsx",
      "components/jarvis/goals/goals-domain-toggle.tsx",
      "app/goals/short-term/page.tsx",
      "app/goals/three-month/page.tsx",
      "app/goals/long-term/page.tsx",
    ].map(readSource);

    for (const source of componentSources) {
      expect(source).not.toContain("How this feeds your board");
    }
  });

  it("T. keeps page entry points read-only without actions or mutations", () => {
    const pageSources = [
      "app/goals/short-term/page.tsx",
      "app/goals/three-month/page.tsx",
      "app/goals/long-term/page.tsx",
      "lib/jarvis/goals/load-goals.ts",
    ].map(readSource);

    for (const source of pageSources) {
      expect(source).not.toMatch(/\b(insert|update|delete|upsert)\b/i);
      expect(source).not.toContain("/actions");
    }
  });
});

const {
  createClientMock,
  loadGoalsMock,
  redirectMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  loadGoalsMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/jarvis/goals/load-goals", () => ({
  loadGoals: loadGoalsMock,
}));

vi.mock("@/components/jarvis/jarvis-app-shell", () => ({
  JarvisAppShell: ({ children }: { children: React.ReactNode }) => children,
}));

import ShortTermGoalsPage from "@/app/goals/short-term/page";
import ThreeMonthGoalsPage from "@/app/goals/three-month/page";
import LongTermGoalsPage from "@/app/goals/long-term/page";

describe("Jarvis goals routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: "user-1" } },
          error: null,
        }),
      },
    });
    loadGoalsMock.mockResolvedValue(sampleData("short_term"));
  });

  it.each([
    [ShortTermGoalsPage, "short_term"],
    [ThreeMonthGoalsPage, "three_month"],
    [LongTermGoalsPage, "long_term"],
  ] as const)("loads the %s page with the matching goal type", async (Page, goalType) => {
    loadGoalsMock.mockResolvedValueOnce(sampleData(goalType));
    await Page();
    expect(loadGoalsMock).toHaveBeenCalledWith(expect.anything(), "user-1", goalType);
  });
});

describe("Jarvis sidebar goals navigation", () => {
  it("adds three independent goals links", () => {
    const source = readSource("components/jarvis/jarvis-sidebar.tsx");

    expect(source).toContain('href: "/goals/short-term"');
    expect(source).toContain('href: "/goals/three-month"');
    expect(source).toContain('href: "/goals/long-term"');
    expect(source).toContain("GOALS_LINKS");
  });
});
