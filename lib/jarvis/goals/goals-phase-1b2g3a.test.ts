import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

describe("Phase 1B2-G3A goal lifecycle backend", () => {
  it("G3A-1. migration defines metadata/archive/restore RPCs", () => {
    const migration = readSource(
      "supabase/migrations/20260809060000_add_jarvis_goal_metadata_archive_rpcs.sql",
    );

    expect(migration).toContain("public.update_jarvis_goal_metadata");
    expect(migration).toContain("public.archive_jarvis_goal");
    expect(migration).toContain("public.restore_jarvis_goal");
    expect(migration).toContain("PERFORM jarvis_internal.reconcile_jarvis_goal_completion");
    expect(migration).not.toContain("current_focus");
    expect(migration).not.toContain("jarvis_visible_tasks");
  });

  it("G3A-2. server actions wire lifecycle mutations with revalidation", () => {
    const actionsSource = readSource("app/goals/actions.ts");

    expect(actionsSource).toContain("updateJarvisGoalMetadata");
    expect(actionsSource).toContain("archiveJarvisGoal");
    expect(actionsSource).toContain("restoreJarvisGoal");
    expect(actionsSource).toContain("export async function updateGoalMetadata");
    expect(actionsSource).toContain("export async function archiveGoal");
    expect(actionsSource).toContain("export async function restoreGoal");
    expect(actionsSource).toMatch(/updateGoalMetadata[\s\S]*revalidateGoalPages/);
    expect(actionsSource).toMatch(/archiveGoal[\s\S]*revalidateGoalPages/);
    expect(actionsSource).toMatch(/restoreGoal[\s\S]*revalidateGoalPages/);
    expect(actionsSource).not.toContain("current_focus");
  });

  it("G3A-3. lifecycle UI uses server actions, not direct Supabase", () => {
    const panelSource = readSource("components/jarvis/goals/goal-settings-panel.tsx");

    expect(panelSource).toContain("updateGoalMetadata");
    expect(panelSource).toContain("archiveGoal");
    expect(panelSource).not.toContain("restoreGoal");
    expect(panelSource).not.toContain(".rpc(");
    expect(panelSource).not.toContain("createClient");
  });

  it("G3A-4. G1/G2 read paths unchanged", () => {
    expect(readSource("app/tasks/page.tsx")).toContain("jarvis_visible_tasks");
    expect(readSource("lib/jarvis/tools/task-tools.ts")).toContain(
      "jarvis_visible_tasks",
    );
  });

  it("G3A-5. SQL validation covers metadata, archive, restore, and security", () => {
    const validation = readSource(
      "supabase/tests/jarvis_goal_metadata_archive_validation.sql",
    );

    expect(validation).toContain("active title edit failed");
    expect(validation).toContain("completed goal archive failed");
    expect(validation).toContain("archived unfinished goal must restore active");
    expect(validation).toContain("stale completed_at must not force completed restore");
    expect(validation).toContain("authenticated must not have DELETE on jarvis_goals");
  });
});
