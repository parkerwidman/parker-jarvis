import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("Phase 1B2-H1A unified task completion", () => {
  it("H1A-1. task-tools.completeTask dispatches by goal_id attachment", () => {
    const source = readSource("lib/jarvis/tools/task-tools.ts");

    expect(source).toContain('select("goal_id")');
    expect(source).toContain("attachment.goal_id !== null");
    expect(source).toContain('.is("goal_id", null)');
    expect(source).toContain("completeGoalLinkedTask");
    expect(source).toContain("completeStandaloneTask");
  });

  it("H1A-2. Command Center dashboard completion uses unified dispatcher", () => {
    const source = readSource("app/command-center/actions.ts");

    expect(source).toContain('from "@/lib/jarvis/tools/task-tools"');
    expect(source).toContain("await completeTask(supabase, userId");
    expect(source).not.toMatch(
      /completeTaskFromDashboard[\s\S]*\.from\("tasks"\)[\s\S]*\.update\(\{/,
    );
    expect(source).toContain("revalidateAfterTaskCompletion");
  });

  it("H1A-3. /tasks completion action uses unified dispatcher", () => {
    const source = readSource("app/tasks/actions.ts");

    expect(source).toContain("completeTaskUnified");
    expect(source).not.toMatch(
      /export async function completeTask[\s\S]*\.from\("tasks"\)[\s\S]*\.update\(\{/,
    );
    expect(source).toContain("revalidateAfterTaskCompletion");
  });

  it("H1A-4. Ask Jarvis complete_task continues through task-tools.completeTask", () => {
    const source = readSource("lib/jarvis/agents/tool-executor.ts");

    expect(source).toMatch(/case "complete_task":[\s\S]*completeTask\(/);
  });

  it("H1A-5. Goals UI still uses setJarvisGoalTaskCompletion directly", () => {
    const actionsSource = readSource("app/goals/actions.ts");
    const rowSource = readSource("components/jarvis/goals/goal-task-row.tsx");

    expect(actionsSource).toContain("setJarvisGoalTaskCompletion");
    expect(rowSource).toContain("setGoalTaskCompletion(task.id, !task.isDone)");
    expect(rowSource).not.toContain("completeTask");
  });

  it("H1A-6. goal-task completion revalidates goal pages from generic surfaces", () => {
    const source = readSource("lib/jarvis/goals/revalidate-goal-pages.ts");

    expect(source).toContain("revalidateGoalPages");
    expect(source).toContain("revalidateAfterTaskCompletion");
    expect(source).toContain("GOAL_PAGE_CONFIG");
    expect(source).not.toContain("current_focus");
  });

  it("H1A-7. no Command Center filtering or ranking changes", () => {
    const loader = readSource("lib/jarvis/dashboard/load-command-center.ts");
    const view = readSource("lib/jarvis/dashboard/build-command-center-view.ts");

    expect(loader).not.toContain("jarvis_goals");
    expect(loader).not.toContain("today_priority_goal_id");
    expect(view).not.toContain("deriveLevelStates");
    expect(view).not.toContain("goalContext");
  });

  it("H1A-8. no database migration added for H1A", () => {
    const taskTools = readSource("lib/jarvis/tools/task-tools.ts");

    expect(taskTools).not.toContain(".rpc(");
    expect(taskTools).toContain("setJarvisGoalTaskCompletion");
  });
});
