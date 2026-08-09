import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BLOCK_STALE_STATE_ERROR,
  BLOCKER_EDIT_STALE_STATE_ERROR,
  GOAL_TASK_BLOCKED_REASON_MAX_LENGTH,
} from "./goal-task-mutation-shared";
import {
  baseTask,
  createScopedSupabaseMock,
  TASK_ID,
  USER_ID,
} from "./goal-task-mutation-test-helpers";
import { setJarvisGoalTaskBlockState } from "./set-goal-task-block-state";

const BLOCKED_AT = "2026-08-08T12:00:00.000Z";

describe("setJarvisGoalTaskBlockState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(BLOCKED_AT));
  });

  it("rejects invalid authenticated userId before DB call", async () => {
    const mock = createScopedSupabaseMock({ task: baseTask });

    const result = await setJarvisGoalTaskBlockState(
      mock.supabase,
      null,
      TASK_ID,
      true,
      "Waiting",
    );

    expect(result).toEqual({
      success: false,
      error: "You must be signed in to update this task.",
    });
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("rejects invalid taskId before DB call", async () => {
    const mock = createScopedSupabaseMock({ task: baseTask });

    const result = await setJarvisGoalTaskBlockState(
      mock.supabase,
      USER_ID,
      null,
      true,
      "Waiting",
    );

    expect(result).toEqual({ success: false, error: "Invalid task." });
    expect(mock.updateCallCount).toBe(0);
  });

  it("F. scopes first block UPDATE by id, user_id, unfinished, and unblocked", async () => {
    const mock = createScopedSupabaseMock({
      task: baseTask,
      updateResult: () => ({
        id: TASK_ID,
        blocked_at: BLOCKED_AT,
        blocked_reason: "Waiting",
      }),
    });

    await setJarvisGoalTaskBlockState(mock.supabase, USER_ID, TASK_ID, true, "Waiting");

    expect(mock.updateFilters[0]).toEqual({
      "eq:id": TASK_ID,
      "eq:user_id": USER_ID,
      "neq:status": "done",
      "is:blocked_at": null,
    });
  });

  it("G. scopes blocker reason edit UPDATE by id, user_id, and still-blocked", async () => {
    const mock = createScopedSupabaseMock({
      task: {
        ...baseTask,
        blocked_at: "2026-01-01T00:00:00.000Z",
        blocked_reason: "Old reason",
      },
      updateResult: () => ({
        id: TASK_ID,
        blocked_at: "2026-01-01T00:00:00.000Z",
        blocked_reason: "New reason",
      }),
    });

    await setJarvisGoalTaskBlockState(mock.supabase, USER_ID, TASK_ID, true, "New reason");

    expect(mock.updateFilters[0]).toEqual({
      "eq:id": TASK_ID,
      "eq:user_id": USER_ID,
      "not:blocked_at:is": null,
    });
    expect(mock.updatePayloads[0]).not.toHaveProperty("blocked_at");
  });

  it("E. scopes unblock UPDATE by id and user_id", async () => {
    const mock = createScopedSupabaseMock({
      task: {
        ...baseTask,
        blocked_at: "2026-01-01T00:00:00.000Z",
        blocked_reason: "Old reason",
      },
      updateResult: () => ({
        id: TASK_ID,
        blocked_at: null,
        blocked_reason: null,
      }),
    });

    await setJarvisGoalTaskBlockState(mock.supabase, USER_ID, TASK_ID, false, null);

    expect(mock.updateFilters[0]).toEqual({
      "eq:id": TASK_ID,
      "eq:user_id": USER_ID,
    });
  });

  it("H. returns completed-task error when task became done before first block write", async () => {
    const mock = createScopedSupabaseMock({
      task: baseTask,
      updateResult: () => null,
      rereadTask: { status: "done", blocked_at: null },
    });

    const result = await setJarvisGoalTaskBlockState(
      mock.supabase,
      USER_ID,
      TASK_ID,
      true,
      "Too late",
    );

    expect(result).toEqual({
      success: false,
      error: "Completed tasks cannot be marked blocked.",
    });
  });

  it("J. returns stale-state error when first block conditional update misses", async () => {
    const mock = createScopedSupabaseMock({
      task: baseTask,
      updateResult: () => null,
      rereadTask: { status: "todo", blocked_at: "2026-01-01T00:00:00.000Z" },
    });

    const result = await setJarvisGoalTaskBlockState(
      mock.supabase,
      USER_ID,
      TASK_ID,
      true,
      "Race",
    );

    expect(result).toEqual({ success: false, error: BLOCK_STALE_STATE_ERROR });
  });

  it("I. returns stale-state error when blocker reason edit misses after unblock", async () => {
    const mock = createScopedSupabaseMock({
      task: {
        ...baseTask,
        blocked_at: "2026-01-01T00:00:00.000Z",
        blocked_reason: "Old reason",
      },
      updateResult: () => null,
      rereadTask: { status: "todo", blocked_at: null },
    });

    const result = await setJarvisGoalTaskBlockState(
      mock.supabase,
      USER_ID,
      TASK_ID,
      true,
      "New reason",
    );

    expect(result).toEqual({ success: false, error: BLOCKER_EDIT_STALE_STATE_ERROR });
  });

  it("requires a blocker reason when blocking", async () => {
    const mock = createScopedSupabaseMock({ task: baseTask });

    const result = await setJarvisGoalTaskBlockState(
      mock.supabase,
      USER_ID,
      TASK_ID,
      true,
      null,
    );

    expect(result).toEqual({ success: false, error: "Blocker reason is required." });
    expect(mock.updateCallCount).toBe(0);
  });

  it("rejects over-limit blocker reason", async () => {
    const mock = createScopedSupabaseMock({ task: baseTask });
    const tooLong = "x".repeat(GOAL_TASK_BLOCKED_REASON_MAX_LENGTH + 1);

    const result = await setJarvisGoalTaskBlockState(
      mock.supabase,
      USER_ID,
      TASK_ID,
      true,
      tooLong,
    );

    expect(result).toEqual({ success: false, error: "Blocker reason is too long." });
    expect(mock.updateCallCount).toBe(0);
  });

  it("rejects newly blocking a completed unblocked task before write", async () => {
    const mock = createScopedSupabaseMock({
      task: {
        ...baseTask,
        status: "done",
        completed_at: "2026-01-01T00:00:00.000Z",
      },
    });

    const result = await setJarvisGoalTaskBlockState(
      mock.supabase,
      USER_ID,
      TASK_ID,
      true,
      "Too late",
    );

    expect(result).toEqual({
      success: false,
      error: "Completed tasks cannot be marked blocked.",
    });
    expect(mock.updateCallCount).toBe(0);
  });

  it("unblock remains idempotent when already clear", async () => {
    const mock = createScopedSupabaseMock({ task: baseTask });

    const result = await setJarvisGoalTaskBlockState(
      mock.supabase,
      USER_ID,
      TASK_ID,
      false,
      null,
    );

    expect(result).toEqual({
      success: true,
      taskId: TASK_ID,
      blockedAt: null,
      blockedReason: null,
    });
    expect(mock.updateCallCount).toBe(0);
  });

  it("allows unblocking a completed previously-blocked task", async () => {
    const mock = createScopedSupabaseMock({
      task: {
        ...baseTask,
        status: "done",
        completed_at: "2026-01-01T00:00:00.000Z",
        blocked_at: "2026-01-01T00:00:00.000Z",
        blocked_reason: "Was blocked",
      },
      updateResult: () => ({
        id: TASK_ID,
        blocked_at: null,
        blocked_reason: null,
      }),
    });

    const result = await setJarvisGoalTaskBlockState(
      mock.supabase,
      USER_ID,
      TASK_ID,
      false,
      null,
    );

    expect(result.success).toBe(true);
    expect(mock.updateCallCount).toBe(1);
  });

  it("does not alter status or completed_at when blocking", async () => {
    const mock = createScopedSupabaseMock({
      task: baseTask,
      updateResult: () => ({
        id: TASK_ID,
        blocked_at: BLOCKED_AT,
        blocked_reason: "Hold",
      }),
    });

    await setJarvisGoalTaskBlockState(mock.supabase, USER_ID, TASK_ID, true, "Hold");

    expect(mock.updatePayloads[0]).not.toHaveProperty("status");
    expect(mock.updatePayloads[0]).not.toHaveProperty("completed_at");
  });
});
