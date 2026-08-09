import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOAL_TASK_TITLE_MAX_LENGTH } from "./goal-task-mutation-shared";
import {
  baseTask,
  createScopedSupabaseMock,
  TASK_ID,
  USER_ID,
} from "./goal-task-mutation-test-helpers";
import { editJarvisGoalTaskTitle } from "./edit-goal-task-title";

describe("editJarvisGoalTaskTitle", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("V. rejects unauthenticated userId before DB call", async () => {
    const mock = createScopedSupabaseMock({ task: baseTask });

    const result = await editJarvisGoalTaskTitle(mock.supabase, null, TASK_ID, "New");

    expect(result).toEqual({
      success: false,
      error: "You must be signed in to update this task.",
    });
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("W. rejects invalid taskId", async () => {
    const mock = createScopedSupabaseMock({ task: baseTask });

    const result = await editJarvisGoalTaskTitle(mock.supabase, USER_ID, null, "New");

    expect(result).toEqual({ success: false, error: "Invalid task." });
    expect(mock.updateCallCount).toBe(0);
  });

  it("Y. rejects non-goal task", async () => {
    const mock = createScopedSupabaseMock({
      task: { ...baseTask, goal_id: null },
    });

    const result = await editJarvisGoalTaskTitle(mock.supabase, USER_ID, TASK_ID, "New");

    expect(result).toEqual({
      success: false,
      error: "This task is not part of a Jarvis goal.",
    });
    expect(mock.updateCallCount).toBe(0);
  });

  it("Z. rejects archived goal", async () => {
    const mock = createScopedSupabaseMock({
      task: baseTask,
      goal: { id: baseTask.goal_id!, status: "archived" },
    });

    const result = await editJarvisGoalTaskTitle(mock.supabase, USER_ID, TASK_ID, "New");

    expect(result.success).toBe(false);
    expect(mock.updateCallCount).toBe(0);
  });

  it("AC. allows completed-goal task title edit", async () => {
    const mock = createScopedSupabaseMock({
      task: baseTask,
      goal: { id: baseTask.goal_id!, status: "completed" },
      updateResult: () => ({ id: TASK_ID, title: "Corrected title" }),
    });

    const result = await editJarvisGoalTaskTitle(
      mock.supabase,
      USER_ID,
      TASK_ID,
      "  Corrected title  ",
    );

    expect(result).toEqual({
      success: true,
      taskId: TASK_ID,
      title: "Corrected title",
    });
  });

  it("AE/AF. rejects blank and overlong titles", async () => {
    const mock = createScopedSupabaseMock({ task: baseTask });

    expect((await editJarvisGoalTaskTitle(mock.supabase, USER_ID, TASK_ID, "   ")).success).toBe(
      false,
    );
    expect(
      (
        await editJarvisGoalTaskTitle(
          mock.supabase,
          USER_ID,
          TASK_ID,
          "a".repeat(GOAL_TASK_TITLE_MAX_LENGTH + 1),
        )
      ).success,
    ).toBe(false);
    expect(mock.updateCallCount).toBe(0);
  });

  it("AG. scopes UPDATE by id and user_id", async () => {
    const mock = createScopedSupabaseMock({
      task: baseTask,
      updateResult: () => ({ id: TASK_ID, title: "Renamed" }),
    });

    await editJarvisGoalTaskTitle(mock.supabase, USER_ID, TASK_ID, "Renamed");

    expect(mock.updateFilters[0]).toEqual({
      "eq:id": TASK_ID,
      "eq:user_id": USER_ID,
    });
  });

  it("AH. updates only title and updated_at", async () => {
    const mock = createScopedSupabaseMock({
      task: baseTask,
      updateResult: () => ({ id: TASK_ID, title: "Renamed" }),
    });

    await editJarvisGoalTaskTitle(mock.supabase, USER_ID, TASK_ID, "Renamed");

    expect(mock.updatePayloads[0]).toEqual({
      title: "Renamed",
      updated_at: expect.any(String),
    });
    expect(Object.keys(mock.updatePayloads[0] ?? {})).toEqual(["title", "updated_at"]);
  });

  it("AO. mutation file does not call reconciliation RPC", async () => {
    const mock = createScopedSupabaseMock({
      task: baseTask,
      updateResult: () => ({ id: TASK_ID, title: "Renamed" }),
    });

    await editJarvisGoalTaskTitle(mock.supabase, USER_ID, TASK_ID, "Renamed");

    expect(mock.updateCallCount).toBe(1);
  });
});
