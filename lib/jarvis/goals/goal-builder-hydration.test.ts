import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GoalBuilder } from "@/components/jarvis/goals/goal-builder";
import { GoalsDomainProvider } from "@/components/jarvis/goals/goals-domain-provider";
import type { JarvisGoalType } from "@/lib/jarvis/goals/types";

const ROOT = resolve(import.meta.dirname, "../../..");
const GOAL_BUILDER_PATH = resolve(ROOT, "components/jarvis/goals/goal-builder.tsx");

vi.mock("@/app/goals/actions", () => ({
  publishShortTermGoal: vi.fn(),
  publishThreeMonthGoal: vi.fn(),
  publishLongTermGoal: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function renderGoalBuilder(goalType: JarvisGoalType = "short_term"): string {
  return renderToStaticMarkup(
    createElement(
      GoalsDomainProvider,
      null,
      createElement(GoalBuilder, { goalType }),
    ),
  );
}

function extractAttributeValues(html: string, attribute: "for" | "id"): string[] {
  const pattern =
    attribute === "for"
      ? /htmlFor="([^"]+)"|for="([^"]+)"/g
      : /\sid="([^"]+)"/g;

  const values: string[] = [];
  for (const match of html.matchAll(pattern)) {
    values.push(match[1] ?? match[2] ?? "");
  }

  return values;
}

function pairedLabelInputIds(html: string): Array<{ htmlFor: string; id: string }> {
  const labels = [...html.matchAll(/for="([^"]+)"/g)].map((match) => match[1]);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));

  return labels.map((htmlFor) => ({
    htmlFor,
    id: ids.has(htmlFor) ? htmlFor : "",
  }));
}

describe("GoalBuilder hydration-safe IDs", () => {
  it("uses deterministic initial builder keys across repeated SSR renders", () => {
    const first = renderGoalBuilder("short_term");
    const second = renderGoalBuilder("three_month");
    const third = renderGoalBuilder("long_term");

    for (const html of [first, second, third]) {
      expect(html).toContain("-level-initial-level");
      expect(html).toContain("-task-initial-task");
    }

    const firstLevelFor = first.match(/for="[^"]+-level-initial-level"/)?.[0];
    const secondLevelFor = second.match(/for="[^"]+-level-initial-level"/)?.[0];
    const thirdLevelFor = third.match(/for="[^"]+-level-initial-level"/)?.[0];

    expect(firstLevelFor).toBeDefined();
    expect(firstLevelFor).toBe(secondLevelFor);
    expect(firstLevelFor).toBe(thirdLevelFor);
  });

  it("matches label htmlFor with corresponding input id values", () => {
    const html = renderGoalBuilder("short_term");
    const pairs = pairedLabelInputIds(html);

    expect(pairs.length).toBeGreaterThan(0);
    for (const { htmlFor, id } of pairs) {
      expect(id).not.toBe("");
      expect(htmlFor).toBe(id);
    }
  });

  it("keeps initial level and task IDs uniquely addressable", () => {
    const html = renderGoalBuilder("short_term");
    const ids = extractAttributeValues(html, "id");
    const levelIds = ids.filter((id) => id.includes("-level-"));
    const taskIds = ids.filter((id) => id.includes("-task-"));

    expect(new Set(levelIds).size).toBe(levelIds.length);
    expect(new Set(taskIds).size).toBe(taskIds.length);
    expect(levelIds).toContainEqual(expect.stringContaining("-level-initial-level"));
    expect(taskIds).toContainEqual(expect.stringContaining("-task-initial-task"));
  });

  it("preserves add/remove builder controls structurally", () => {
    const source = readFileSync(GOAL_BUILDER_PATH, "utf8");

    expect(source).toContain("+ Add task to this level");
    expect(source).toContain("+ Add level");
    expect(source).toContain("Remove level");
    expect(source).toContain("Remove");
    expect(source).toContain("createNewLevel");
    expect(source).toContain('createTask(nextBuilderKey("task"))');
    expect(source).toContain("levels: current.levels.filter");
    expect(source).toContain("tasks: entry.tasks.filter");
  });

  it("does not use hydration-unsafe ID generation during initial render", () => {
    const source = readFileSync(GOAL_BUILDER_PATH, "utf8");

    expect(source).not.toMatch(/let\s+\w*builder\w*counter/i);
    expect(source).not.toMatch(/Math\.random/);
    expect(source).not.toMatch(/Date\.now/);
    expect(source).not.toMatch(/randomUUID/);
    expect(source).toContain("INITIAL_BUILDER_LEVEL_KEY");
    expect(source).toContain("INITIAL_BUILDER_TASK_KEY");
    expect(source).toContain("useRef");
  });
});
