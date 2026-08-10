import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { GoalCard } from "@/components/jarvis/goals/goal-card";
import { GoalSettingsPanel } from "@/components/jarvis/goals/goal-settings-panel";
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
    tasks: [sampleTask()],
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
  moveGoalLevel: vi.fn(),
  moveGoalTask: vi.fn(),
  updateGoalMetadata: vi.fn(),
  archiveGoal: vi.fn(),
  restoreGoal: vi.fn(),
}));

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

describe("Phase 1B2-G3B goal settings UI", () => {
  it("G3B-1. normal mode hides Goal Settings", () => {
    const html = renderToStaticMarkup(
      createElement(GoalCard, {
        goal: sampleGoal(),
        currentGoalType: "short_term",
        showTodayPriority: false,
      }),
    );

    expect(html).not.toContain("Goal settings");
    expect(html).not.toContain("Archive goal");
  });

  it("G3B-2. settings panel renders only when editing", () => {
    const hidden = renderToStaticMarkup(
      createElement(GoalSettingsPanel, {
        goalId: "goal-1",
        title: "Launch beta",
        domain: "personal",
        currentGoalType: "short_term",
        isEditing: false,
      }),
    );
    const visible = renderToStaticMarkup(
      createElement(GoalSettingsPanel, {
        goalId: "goal-1",
        title: "Launch beta",
        domain: "personal",
        currentGoalType: "short_term",
        isEditing: true,
      }),
    );

    expect(hidden).toBe("");
    expect(visible).toContain("Goal settings");
    expect(visible).toContain("Archive goal");
  });

  it("G3B-3. title/domain/horizon controls exist with deliberate save", () => {
    const panelSource = readSource("components/jarvis/goals/goal-settings-panel.tsx");

    expect(panelSource).toContain("Title");
    expect(panelSource).toContain("Domain");
    expect(panelSource).toContain("Horizon");
    expect(panelSource).toContain("Save changes");
    expect(panelSource).toContain("handleSaveMetadata");
    expect(panelSource).toContain("hasMetadataChanges");
    expect(panelSource).not.toMatch(/onChange=\{[\s\S]*updateGoalMetadata/);
  });

  it("G3B-4. invalid blank title is blocked before save", () => {
    const panelSource = readSource("components/jarvis/goals/goal-settings-panel.tsx");

    expect(panelSource).toContain("titleInvalid");
    expect(panelSource).toContain("Goal title must be between 1 and 200 characters.");
    expect(panelSource).toMatch(/disabled=\{isPending \|\| titleInvalid\}/);
  });

  it("G3B-5. domain and horizon drafts use Personal/Melusi and horizon options", () => {
    const html = renderToStaticMarkup(
      createElement(GoalSettingsPanel, {
        goalId: "goal-1",
        title: "Launch beta",
        domain: "personal",
        currentGoalType: "short_term",
        isEditing: true,
      }),
    );

    expect(html).toContain("Personal");
    expect(html).toContain("Melusi");
    expect(html).toContain("Short Term");
    expect(html).toContain("3 Month");
    expect(html).toContain("Long Term");
  });

  it("G3B-6. successful horizon change navigates to the new Goals page", () => {
    const panelSource = readSource("components/jarvis/goals/goal-settings-panel.tsx");

    expect(panelSource).toContain("router.push(GOAL_PAGE_CONFIG[goalTypeDraft].route)");
    expect(panelSource).toContain("Moves this goal to");
  });

  it("G3B-7. Today Priority is not manually cleared in goal settings client", () => {
    const panelSource = readSource("components/jarvis/goals/goal-settings-panel.tsx");

    expect(panelSource).not.toContain("clearTodayPriorityGoal");
    expect(panelSource).not.toContain("setTodayPriorityGoal");
    expect(panelSource).not.toContain("today_priority");
  });

  it("G3B-8. completed goals can expose settings in edit mode without structural additions", () => {
    const cardSource = readSource("components/jarvis/goals/goal-card.tsx");
    const levelHtml = renderToStaticMarkup(
      createElement(LevelRoadmap, {
        goalId: "goal-1",
        goalStatus: "completed",
        isEditing: true,
        levels: [sampleLevel({ state: "complete" })],
      }),
    );

    expect(cardSource).toContain("<GoalSettingsPanel");
    expect(levelHtml).not.toContain("Add task");
    expect(levelHtml).not.toContain("Delete level");
    expect(levelHtml).not.toContain("Move up");
  });

  it("G3B-9. archive requires explicit inline confirmation", () => {
    const panelSource = readSource("components/jarvis/goals/goal-settings-panel.tsx");

    expect(panelSource).toContain("archiveConfirmOpen");
    expect(panelSource).toContain(
      "This removes the goal and its tasks from your active Jarvis planning.",
    );
    expect(panelSource).toContain("history is preserved.");
    expect(panelSource).not.toContain("window.confirm");
    expect(panelSource).not.toContain("deleted");
  });

  it("G3B-10. archive pending disables duplicate confirmation actions", () => {
    const panelSource = readSource("components/jarvis/goals/goal-settings-panel.tsx");

    expect(panelSource).toContain('isPending ? "Archiving…" : "Archive goal"');
    expect(panelSource).toMatch(/disabled=\{isPending\}/);
  });

  it("G3B-11. archive success refreshes and failure leaves card state intact", () => {
    const panelSource = readSource("components/jarvis/goals/goal-settings-panel.tsx");

    expect(panelSource).toContain("setArchiveError(result.error)");
    expect(panelSource).toMatch(/router\.refresh\(\)/);
  });

  it("G3B-12. Restore UI is not exposed", () => {
    const panelSource = readSource("components/jarvis/goals/goal-settings-panel.tsx");
    const cardSource = readSource("components/jarvis/goals/goal-card.tsx");
    const pageSource = readSource("components/jarvis/goals/goals-page.tsx");

    expect(panelSource).not.toContain("restoreGoal");
    expect(panelSource).not.toContain("Restore");
    expect(cardSource).not.toContain("restoreGoal");
    expect(pageSource).not.toContain("restoreGoal");
  });

  it("G3B-13. uses existing server actions only", () => {
    const panelSource = readSource("components/jarvis/goals/goal-settings-panel.tsx");

    expect(panelSource).toContain('from "@/app/goals/actions"');
    expect(panelSource).toContain("updateGoalMetadata");
    expect(panelSource).toContain("archiveGoal");
    expect(panelSource).not.toContain(".rpc(");
    expect(panelSource).not.toContain("createClient");
  });

  it("G3B-14. does not touch current_focus", () => {
    const changedFiles = [
      "components/jarvis/goals/goal-settings-panel.tsx",
      "components/jarvis/goals/goal-card.tsx",
      "components/jarvis/goals/goals-page.tsx",
      "app/globals.css",
    ];

    for (const file of changedFiles) {
      expect(readSource(file)).not.toContain("current_focus");
    }
  });

  it("G3B-15. goal card passes page goal type into settings", () => {
    const cardSource = readSource("components/jarvis/goals/goal-card.tsx");
    const pageSource = readSource("components/jarvis/goals/goals-page.tsx");

    expect(cardSource).toContain("currentGoalType");
    expect(pageSource).toContain("currentGoalType={data.goalType}");
  });
});
