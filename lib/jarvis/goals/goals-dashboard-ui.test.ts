import { createElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GoalSettingsPanel } from "@/components/jarvis/goals/goal-settings-panel";
import { GoalsPage } from "@/components/jarvis/goals/goals-page";
import type { GoalView, GoalsPageData } from "@/lib/jarvis/goals/types";

const ROOT = resolve(import.meta.dirname, "../../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

vi.mock("@/app/goals/actions", () => ({
  publishShortTermGoal: vi.fn(),
  publishThreeMonthGoal: vi.fn(),
  publishLongTermGoal: vi.fn(),
  setTodayPriorityGoal: vi.fn(),
  clearTodayPriorityGoal: vi.fn(),
  updateGoalMetadata: vi.fn(),
  archiveGoal: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/components/jarvis/command-center/mode-switcher", () => ({
  ModeSwitcher: () => null,
}));

const GOAL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GOAL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function goal(overrides: Partial<GoalView> = {}): GoalView {
  return {
    id: GOAL_A,
    title: "Launch beta",
    description: "Overview copy",
    notes: "Notes copy",
    targetDate: "2026-12-01",
    domain: "personal",
    status: "active",
    sortOrder: 0,
    completedAt: null,
    progressPercent: 40,
    isCurrentPriority: true,
    isTodayPriority: true,
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
            dueAt: "2026-08-31T12:00:00.000Z",
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

function sampleData(overrides: Partial<GoalsPageData> = {}): GoalsPageData {
  return {
    goalType: "short_term",
    domain: "personal",
    priorityGoalId: GOAL_A,
    todayPriorityGoalId: GOAL_A,
    counts: { all: 2, active: 2, completed: 0, priority: 1 },
    goals: [goal(), goal({ id: GOAL_B, title: "Ship v2", isCurrentPriority: false, isTodayPriority: false })],
    ...overrides,
  };
}

describe("Goals dashboard D4.2", () => {
  it("renders filter counts and compact cards for the active workspace", () => {
    const html = renderToStaticMarkup(
      createElement(GoalsPage, {
        data: sampleData(),
        goalType: "short_term",
      }),
    );

    expect(html).toContain("gd2-filter-bar");
    expect(html).toContain("All Goals");
    expect(html).toContain("Current Priority");
    expect(html).toContain("Completed");
    expect(html).toContain("gd2-goal-card");
    expect(html).toContain("CURRENT PRIORITY");
    expect(html).toContain("gd2-detail-panel");
    expect(html).toContain("Goal Overview");
    expect(html).toContain("Due Aug 31, 2026");
  });

  it("shows workspace-specific empty priority state", () => {
    const html = renderToStaticMarkup(
      createElement(GoalsPage, {
        data: sampleData({
          priorityGoalId: null,
          todayPriorityGoalId: null,
          counts: { all: 1, active: 1, completed: 0, priority: 0 },
          goals: [goal({ isCurrentPriority: false, isTodayPriority: false })],
        }),
        goalType: "short_term",
      }),
    );

    expect(html).toContain("gd2-builder-toggle");
    expect(html).toContain("Add Goal");
  });

  it("detail edit mode keeps settings in a scroll region with a pinned footer", () => {
    const panelSource = readSource("components/jarvis/goals/goal-detail-panel.tsx");
    const settingsSource = readSource("components/jarvis/goals/goal-settings-panel.tsx");
    const cssSource = readSource("app/globals.css");

    expect(panelSource).toContain("gd2-detail-edit-settings");
    expect(panelSource).toContain("embedded");
    expect(settingsSource).toContain("gd2-edit-settings-scroll");
    expect(settingsSource).toContain("gd2-edit-settings-footer");
    expect(cssSource).toContain(".gd2-edit-settings-scroll");
    expect(cssSource).toContain(".gd2-edit-settings-footer");
    expect(cssSource).toMatch(/\.gd2-edit-settings-scroll[\s\S]*overflow-y:\s*auto/);
  });

  it("embedded goal settings render save controls inside the footer region", () => {
    const html = renderToStaticMarkup(
      createElement(GoalSettingsPanel, {
        goalId: GOAL_A,
        title: "Launch beta",
        description: "Overview copy",
        notes: "Notes copy",
        targetDate: "2026-12-01",
        domain: "personal",
        currentGoalType: "short_term",
        isEditing: true,
        embedded: true,
      }),
    );

    expect(html).toContain("gd2-edit-settings-scroll");
    expect(html).toContain("gd2-edit-settings-footer");
    expect(html).toContain('type="date"');
    expect(html).toContain("Archive goal");
  });
});
