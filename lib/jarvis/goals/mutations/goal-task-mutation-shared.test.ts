import { describe, expect, it } from "vitest";
import { loadGoalTaskMutationContext } from "./goal-task-mutation-shared";
import {
  baseTask,
  createScopedSupabaseMock,
  GOAL_ID,
  LEVEL_ID,
  OTHER_USER_ID,
  TASK_ID,
  USER_ID,
} from "./goal-task-mutation-test-helpers";

describe("loadGoalTaskMutationContext", () => {
  it("A. scopes task load by id and user_id", async () => {
    const mock = createScopedSupabaseMock({
      task: baseTask,
      goal: { id: GOAL_ID, status: "active" },
      level: { id: LEVEL_ID, goal_id: GOAL_ID },
    });

    await loadGoalTaskMutationContext(mock.supabase, USER_ID, TASK_ID);

    expect(mock.loadFilters[0]).toEqual({
      "eq:id": TASK_ID,
      "eq:user_id": USER_ID,
    });
  });

  it("B. scopes goal load by id and user_id", async () => {
    const mock = createScopedSupabaseMock({
      task: baseTask,
      goal: { id: GOAL_ID, status: "active" },
      level: { id: LEVEL_ID, goal_id: GOAL_ID },
    });

    await loadGoalTaskMutationContext(mock.supabase, USER_ID, TASK_ID);

    expect(mock.loadFilters[1]).toEqual({
      "eq:id": GOAL_ID,
      "eq:user_id": USER_ID,
    });
  });

  it("C. scopes level load by id and user_id", async () => {
    const mock = createScopedSupabaseMock({
      task: baseTask,
      goal: { id: GOAL_ID, status: "active" },
      level: { id: LEVEL_ID, goal_id: GOAL_ID },
    });

    await loadGoalTaskMutationContext(mock.supabase, USER_ID, TASK_ID);

    expect(mock.loadFilters[2]).toEqual({
      "eq:id": LEVEL_ID,
      "eq:user_id": USER_ID,
    });
  });

  it("B. rejects other-user missing tasks as not found", async () => {
    const mock = createScopedSupabaseMock({ task: null });

    const result = await loadGoalTaskMutationContext(mock.supabase, OTHER_USER_ID, TASK_ID);

    expect(result).toEqual({
      success: false,
      error: "Task not found.",
      code: "task_not_found",
    });
  });

  it("rejects ordinary non-goal tasks", async () => {
    const mock = createScopedSupabaseMock({
      task: { ...baseTask, goal_id: null, goal_level_id: null },
    });

    const result = await loadGoalTaskMutationContext(mock.supabase, USER_ID, TASK_ID);

    expect(result).toEqual({
      success: false,
      error: "This task is not part of a Jarvis goal.",
      code: "not_goal_task",
    });
  });

  it("rejects missing goal level attachment", async () => {
    const mock = createScopedSupabaseMock({
      task: { ...baseTask, goal_level_id: null },
    });

    const result = await loadGoalTaskMutationContext(mock.supabase, USER_ID, TASK_ID);

    expect(result).toEqual({
      success: false,
      error: "This goal task has an invalid attachment.",
      code: "malformed_goal_task",
    });
  });

  it("rejects archived parent goals", async () => {
    const mock = createScopedSupabaseMock({
      task: baseTask,
      goal: { id: GOAL_ID, status: "archived" },
    });

    const result = await loadGoalTaskMutationContext(mock.supabase, USER_ID, TASK_ID);

    expect(result).toEqual({
      success: false,
      error: "Archived goals cannot be updated.",
      code: "goal_archived",
    });
  });

  it("rejects mismatched level/goal attachment", async () => {
    const mock = createScopedSupabaseMock({
      task: baseTask,
      goal: { id: GOAL_ID, status: "active" },
      level: { id: LEVEL_ID, goal_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
    });

    const result = await loadGoalTaskMutationContext(mock.supabase, USER_ID, TASK_ID);

    expect(result).toEqual({
      success: false,
      error: "This goal task has an invalid attachment.",
      code: "malformed_goal_task",
    });
  });

  it("returns validated goal task context", async () => {
    const mock = createScopedSupabaseMock({
      task: baseTask,
      goal: { id: GOAL_ID, status: "active" },
      level: { id: LEVEL_ID, goal_id: GOAL_ID },
    });

    const result = await loadGoalTaskMutationContext(mock.supabase, USER_ID, TASK_ID);

    expect(result).toEqual({
      taskId: TASK_ID,
      goalId: GOAL_ID,
      goalLevelId: LEVEL_ID,
      status: "todo",
      completedAt: null,
      blockedAt: null,
      blockedReason: null,
      notes: null,
    });
  });
});
