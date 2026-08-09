import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { GoalCard } from "@/components/jarvis/goals/goal-card";
import { GoalsPage } from "@/components/jarvis/goals/goals-page";
import { GOAL_PAGE_CONFIG, type GoalView } from "@/lib/jarvis/goals/types";

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
    progressPercent: 40,
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

vi.mock("@/app/goals/actions", () => ({
  publishShortTermGoal: vi.fn(),
  publishThreeMonthGoal: vi.fn(),
  publishLongTermGoal: vi.fn(),
  setTodayPriorityGoal: vi.fn(),
  clearTodayPriorityGoal: vi.fn(),
  setGoalTaskCompletion: vi.fn(),
  setGoalTaskNotes: vi.fn(),
  setGoalTaskBlockState: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("Jarvis goals phase 1B2C today's priority", () => {
  it("V. active Short Term non-priority shows Set action", () => {
    const html = renderToStaticMarkup(
      createElement(GoalCard, {
        goal: sampleGoal(),
        showTodayPriority: true,
      }),
    );

    expect(html).toContain("Set as Today&#x27;s Priority");
    expect(html).not.toContain("Clear Priority");
  });

  it("W. selected active Short Term shows TODAY'S PRIORITY badge", () => {
    const html = renderToStaticMarkup(
      createElement(GoalCard, {
        goal: sampleGoal({ isTodayPriority: true }),
        showTodayPriority: true,
      }),
    );

    expect(html).toContain("goals-priority-badge");
    expect(html).toContain("TODAY&#x27;S PRIORITY");
    expect(html).toContain("goals-card--priority");
  });

  it("X. selected goal shows Clear Priority", () => {
    const html = renderToStaticMarkup(
      createElement(GoalCard, {
        goal: sampleGoal({ isTodayPriority: true }),
        showTodayPriority: true,
      }),
    );

    expect(html).toContain("Clear Priority");
    expect(html).not.toContain("Set as Today&#x27;s Priority");
  });

  it("Y. completed Short Term has no Set action", () => {
    const html = renderToStaticMarkup(
      createElement(GoalCard, {
        goal: sampleGoal({ status: "completed", progressPercent: 100 }),
        showTodayPriority: true,
      }),
    );

    expect(html).not.toContain("Set as Today&#x27;s Priority");
    expect(html).not.toContain("Clear Priority");
  });

  it("Z. stale completed priority ID does not render priority badge", () => {
    const html = renderToStaticMarkup(
      createElement(GoalCard, {
        goal: sampleGoal({
          status: "completed",
          progressPercent: 100,
          isTodayPriority: false,
        }),
        showTodayPriority: true,
      }),
    );

    expect(html).not.toContain("goals-priority-badge");
    expect(html).not.toContain("Clear Priority");
  });

  it.each(["three_month", "long_term"] as const)(
    "AA/AB. %s page has no priority controls",
    (goalType) => {
      const html = renderToStaticMarkup(
        createElement(GoalsPage, {
          data: {
            goalType,
            todayPriorityGoalId: sampleGoal().id,
            goals: [sampleGoal({ isTodayPriority: true })],
          },
          goalType,
        }),
      );

      expect(html).not.toContain("Set as Today&#x27;s Priority");
      expect(html).not.toContain("Clear Priority");
      expect(html).not.toContain("goals-priority-badge");
      expect(GOAL_PAGE_CONFIG[goalType].showTodayPriority).toBe(false);
    },
  );

  it("AC. Personal and Melusi domain styles remain unchanged", () => {
    const personalHtml = renderToStaticMarkup(
      createElement(GoalCard, {
        goal: sampleGoal({ domain: "personal" }),
        showTodayPriority: true,
      }),
    );
    const melusiHtml = renderToStaticMarkup(
      createElement(GoalCard, {
        goal: sampleGoal({ domain: "melusi", isTodayPriority: true }),
        showTodayPriority: true,
      }),
    );

    expect(personalHtml).toContain("goals-card--personal");
    expect(personalHtml).toContain("goals-domain-tag--personal");
    expect(melusiHtml).toContain("goals-card--melusi");
    expect(melusiHtml).toContain("goals-domain-tag--melusi");
    expect(melusiHtml).toContain("goals-priority-badge");
  });

  it("A/B. server actions authenticate before priority mutation", () => {
    const actionsSource = readSource("app/goals/actions.ts");

    expect(actionsSource).toMatch(
      /setTodayPriorityGoal[\s\S]*requireAuthenticatedUser[\s\S]*setJarvisTodayPriorityGoal/,
    );
    expect(actionsSource).toMatch(
      /clearTodayPriorityGoal[\s\S]*requireAuthenticatedUser[\s\S]*clearJarvisTodayPriorityGoal/,
    );
  });

  it("E. set action accepts only goalId from client", () => {
    const actionsSource = readSource("app/goals/actions.ts");
    const cardSource = readSource("components/jarvis/goals/goal-card.tsx");

    expect(actionsSource).toMatch(/export async function setTodayPriorityGoal\(\s*goalId: unknown/);
    expect(actionsSource).toContain("setJarvisTodayPriorityGoal(supabase, userId, goalId)");
    expect(cardSource).toContain("setTodayPriorityGoal(goal.id)");
    expect(cardSource).not.toContain("userId");
  });

  it("F. clear action accepts no client mutation argument", () => {
    const actionsSource = readSource("app/goals/actions.ts");
    const cardSource = readSource("components/jarvis/goals/goal-card.tsx");

    expect(actionsSource).toMatch(/export async function clearTodayPriorityGoal\(\)/);
    expect(actionsSource).toContain("clearJarvisTodayPriorityGoal(supabase, userId)");
    expect(cardSource).toContain("clearTodayPriorityGoal()");
  });

  it("AG. priority mutations do not read or write current_focus", () => {
    const mutationSource = readSource(
      "lib/jarvis/goals/mutations/set-today-priority-goal.ts",
    );
    const cardSource = readSource("components/jarvis/goals/goal-card.tsx");

    expect(mutationSource).not.toContain("current_focus");
    expect(cardSource).not.toContain("current_focus");
  });

  it("AH. no Command Center or Morning Brief integration", () => {
    const mutationSource = readSource(
      "lib/jarvis/goals/mutations/set-today-priority-goal.ts",
    );
    const actionsSource = readSource("app/goals/actions.ts");
    const cardSource = readSource("components/jarvis/goals/goal-card.tsx");

    for (const source of [mutationSource, actionsSource, cardSource]) {
      expect(source).not.toMatch(/command.?center/i);
      expect(source).not.toMatch(/morning.?brief/i);
    }
  });

  it("AD. phase 1B2A completion migration still clears priority on goal completion", () => {
    const migrationSource = readSource(
      "supabase/migrations/20260809010000_add_jarvis_goal_task_completion_rpc.sql",
    );

    expect(migrationSource).toContain("today_priority_goal_id");
    expect(migrationSource).toMatch(/today_priority_goal_id\s*=\s*NULL/i);
  });

  it("AE. completion mutation does not duplicate profile clear on task completion", () => {
    const completionSource = readSource(
      "lib/jarvis/goals/mutations/set-goal-task-completion.ts",
    );

    expect(completionSource).not.toContain("today_priority_goal_id");
    expect(completionSource).not.toContain("jarvis_profiles");
  });

  it("AF. notes/blockers mutations remain isolated from priority", () => {
    const notesSource = readSource("lib/jarvis/goals/mutations/set-goal-task-notes.ts");
    const blockSource = readSource("lib/jarvis/goals/mutations/set-goal-task-block-state.ts");

    for (const source of [notesSource, blockSource]) {
      expect(source).not.toContain("today_priority_goal_id");
    }
  });

  it("uses router refresh after priority actions without optimistic switching", () => {
    const cardSource = readSource("components/jarvis/goals/goal-card.tsx");

    expect(cardSource).toContain("router.refresh()");
    expect(cardSource).toContain("disabled={isPending}");
    expect(cardSource).not.toMatch(/optimistic/i);
  });

  it("load-goals derives isTodayPriority only from id, status, and goal type", () => {
    const loadSource = readSource("lib/jarvis/goals/load-goals.ts");

    expect(loadSource).toContain('goalType === "short_term"');
    expect(loadSource).toContain('goal.status === "active"');
    expect(loadSource).toContain("todayPriorityGoalId === goal.id");
    expect(loadSource).not.toContain("current_focus");
  });
});
