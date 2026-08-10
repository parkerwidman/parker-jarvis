import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/jarvis/tools/microsoft-tools", () => ({
  listOutlookCalendar: vi.fn().mockResolvedValue({
    success: false,
    needsConnection: true,
  }),
  listOutlookInbox: vi.fn().mockResolvedValue({
    success: false,
    needsConnection: true,
  }),
}));

import { loadCommandCenter } from "@/lib/jarvis/dashboard/load-command-center";
import { listTasks } from "@/lib/jarvis/tools/task-tools";

const ROOT = resolve(import.meta.dirname, "../../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function createListQueryMock() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.neq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.then = (
    onFulfilled: (value: { data: unknown[]; error: null }) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) =>
    Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);

  return chain;
}

describe("Phase 1B2-G2 archived-goal task read filtering", () => {
  it("G2-1. /tasks page lists from jarvis_visible_tasks", () => {
    const source = readSource("app/tasks/page.tsx");

    expect(source).toContain('.from("jarvis_visible_tasks")');
    expect(source).not.toContain('.from("tasks")');
  });

  it("G2-2. Command Center loader lists from jarvis_visible_tasks", () => {
    const source = readSource("lib/jarvis/dashboard/load-command-center.ts");

    expect(source).toContain('.from("jarvis_visible_tasks")');
    expect(source).not.toContain('.from("tasks")');
  });

  it("G2-3. Morning Brief task retrieval lists from jarvis_visible_tasks", () => {
    const source = readSource("lib/jarvis/briefings/generate-morning-brief.ts");

    expect(source).toMatch(
      /listMorningBriefTasks[\s\S]*\.from\("jarvis_visible_tasks"\)/,
    );
    expect(source).not.toMatch(
      /listMorningBriefTasks[\s\S]*\.from\("tasks"\)/,
    );
  });

  it("G2-4. listTasks generic path lists from jarvis_visible_tasks", () => {
    const source = readSource("lib/jarvis/tools/task-tools.ts");

    expect(source).toMatch(
      /export async function listTasks[\s\S]*\.from\("jarvis_visible_tasks"\)/,
    );
  });

  it("G2-5. Daily Plan continues through listTasks", () => {
    const source = readSource("lib/jarvis/plans/generate-daily-plan.ts");

    expect(source).toContain('from "@/lib/jarvis/tools/task-tools"');
    expect(source).toContain("listTasks(supabase, userId)");
    expect(source).not.toContain('.from("tasks")');
  });

  it("G2-6. Ask Jarvis list_tasks continues through listTasks", () => {
    const source = readSource("lib/jarvis/agents/tool-executor.ts");

    expect(source).toContain("listTasks(supabase, userId");
    expect(source).not.toContain('.from("tasks")');
  });

  it("G2-7. Goals roadmap loader still reads tasks directly", () => {
    const source = readSource("lib/jarvis/goals/load-goals.ts");

    expect(source).toContain('.from("tasks")');
    expect(source).not.toContain("jarvis_visible_tasks");
  });

  it("G2-8. assistant context by-ID lookup still reads tasks directly", () => {
    const source = readSource("lib/jarvis/context/load-assistant-context.ts");

    expect(source).toContain('.from("tasks")');
    expect(source).not.toContain("jarvis_visible_tasks");
  });

  it("G2-9. mutation paths use tasks table appropriately after H1A", () => {
    const taskToolsSource = readSource("lib/jarvis/tools/task-tools.ts");
    const tasksActionsSource = readSource("app/tasks/actions.ts");
    const commandCenterActionsSource = readSource("app/command-center/actions.ts");

    expect(taskToolsSource).toMatch(
      /export async function createTask[\s\S]*\.from\("tasks"\)/,
    );
    expect(taskToolsSource).toContain("completeStandaloneTask");
    expect(taskToolsSource).toContain("setJarvisGoalTaskCompletion");
    expect(tasksActionsSource).toMatch(
      /export async function createTask[\s\S]*\.from\("tasks"\)/,
    );
    expect(tasksActionsSource).toContain("completeTaskUnified");
    expect(tasksActionsSource).not.toMatch(
      /export async function completeTask[\s\S]*\.from\("tasks"\)[\s\S]*\.update\(\{/,
    );
    expect(commandCenterActionsSource).toContain("completeTask(supabase, userId");
    expect(commandCenterActionsSource).not.toMatch(
      /completeTaskFromDashboard[\s\S]*\.from\("tasks"\)[\s\S]*\.update\(\{/,
    );
  });

  it("G2-10. listTasks preserves select, filters, sort, and limit behavior", () => {
    const source = readSource("lib/jarvis/tools/task-tools.ts");

    expect(source).toContain(
      'const TASK_SELECT =\n  "id, title, status, priority, due_at, completed_at, created_at"',
    );
    expect(source).toContain('.eq("user_id", userId)');
    expect(source).toContain('.neq("status", "done")');
    expect(source).toContain(".sort(compareTasks).slice(0, 100)");
    expect(source).toContain("listProjectTasks");
  });
});

describe("Phase 1B2-G2 listTasks behavior", () => {
  it("G2-11. listTasks queries jarvis_visible_tasks for generic listing", async () => {
    const query = createListQueryMock();
    const from = vi.fn(() => query);
    const supabase = { from } as never;

    const result = await listTasks(supabase, "user-1");

    expect(result.success).toBe(true);
    expect(from).toHaveBeenCalledWith("jarvis_visible_tasks");
    expect(from).not.toHaveBeenCalledWith("tasks");
    expect(query.select).toHaveBeenCalledWith(
      "id, title, status, priority, due_at, completed_at, created_at",
    );
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("G2-12. listTasks still routes project-scoped listing through listProjectTasks", () => {
    const source = readSource("lib/jarvis/tools/task-tools.ts");
    const projectBranch = source.match(
      /if \(projectId \|\| projectName\) \{[\s\S]*?\n  \}\n\n  let query = supabase/,
    )?.[0];

    expect(projectBranch).toBeDefined();
    expect(projectBranch).toContain("listProjectTasks");
    expect(projectBranch).not.toContain("jarvis_visible_tasks");
  });
});

describe("Phase 1B2-G2 loadCommandCenter behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("G2-13. loadCommandCenter queries jarvis_visible_tasks for task rows", async () => {
    const tables: string[] = [];

    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.not = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    chain.then = (
      onFulfilled: (value: { data: unknown; error: null }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);

    const supabase = {
      from: vi.fn((table: string) => {
        tables.push(table);

        if (table === "jarvis_profiles") {
          return {
            ...chain,
            maybeSingle: vi.fn(async () => ({
              data: {
                user_id: "user-1",
                preferred_name: "Parker",
                timezone: "America/Chicago",
                current_focus: null,
              },
              error: null,
            })),
          };
        }

        return chain;
      }),
    };

    await loadCommandCenter(supabase as never, "user-1");

    expect(tables).toContain("jarvis_visible_tasks");
    expect(tables).not.toContain("tasks");
  });
});
