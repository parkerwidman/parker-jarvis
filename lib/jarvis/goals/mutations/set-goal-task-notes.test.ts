import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOAL_TASK_NOTES_MAX_LENGTH } from "./goal-task-mutation-shared";
import {
  baseTask,
  createScopedSupabaseMock,
  TASK_ID,
  USER_ID,
} from "./goal-task-mutation-test-helpers";
import { setJarvisGoalTaskNotes } from "./set-goal-task-notes";

describe("setJarvisGoalTaskNotes", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("rejects invalid authenticated userId before DB call", async () => {
    const mock = createScopedSupabaseMock({ task: baseTask });

    const result = await setJarvisGoalTaskNotes(mock.supabase, null, TASK_ID, "hello");

    expect(result).toEqual({
      success: false,
      error: "You must be signed in to update this task.",
    });
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("rejects invalid taskId runtime input before DB call", async () => {
    const mock = createScopedSupabaseMock({ task: baseTask });

    const result = await setJarvisGoalTaskNotes(mock.supabase, USER_ID, null, "hello");

    expect(result).toEqual({ success: false, error: "Invalid task." });
    expect(mock.updateCallCount).toBe(0);
  });

  it("rejects non-string notes runtime input", async () => {
    const mock = createScopedSupabaseMock({ task: baseTask });

    const result = await setJarvisGoalTaskNotes(mock.supabase, USER_ID, TASK_ID, 123);

    expect(result).toEqual({ success: false, error: "Invalid note." });
    expect(mock.updateCallCount).toBe(0);
  });

  it("D. scopes notes UPDATE by id and user_id", async () => {
    const mock = createScopedSupabaseMock({
      task: baseTask,
      updateResult: () => ({ id: TASK_ID, notes: "Ship docs" }),
    });

    await setJarvisGoalTaskNotes(mock.supabase, USER_ID, TASK_ID, "Ship docs");

    expect(mock.updateFilters[0]).toEqual({
      "eq:id": TASK_ID,
      "eq:user_id": USER_ID,
    });
  });

  it("saves a valid note", async () => {
    const mock = createScopedSupabaseMock({
      task: baseTask,
      updateResult: () => ({ id: TASK_ID, notes: "Ship docs" }),
    });

    const result = await setJarvisGoalTaskNotes(mock.supabase, USER_ID, TASK_ID, "Ship docs");

    expect(result).toEqual({
      success: true,
      taskId: TASK_ID,
      notes: "Ship docs",
    });
  });

  it("trims note whitespace and saves blank as NULL", async () => {
    const mock = createScopedSupabaseMock({
      task: { ...baseTask, notes: "Old note" },
      updateResult: () => ({ id: TASK_ID, notes: null }),
    });

    await setJarvisGoalTaskNotes(mock.supabase, USER_ID, TASK_ID, "   ");

    expect(mock.updatePayloads[0]).toEqual({
      notes: null,
      updated_at: expect.any(String),
    });
  });

  it("rejects over-limit notes", async () => {
    const mock = createScopedSupabaseMock({ task: baseTask });
    const tooLong = "a".repeat(GOAL_TASK_NOTES_MAX_LENGTH + 1);

    const result = await setJarvisGoalTaskNotes(mock.supabase, USER_ID, TASK_ID, tooLong);

    expect(result).toEqual({ success: false, error: "Note is too long." });
    expect(mock.updateCallCount).toBe(0);
  });

  it("only updates notes and updated_at", async () => {
    const mock = createScopedSupabaseMock({
      task: baseTask,
      updateResult: () => ({ id: TASK_ID, notes: "Scoped" }),
    });

    await setJarvisGoalTaskNotes(mock.supabase, USER_ID, TASK_ID, "Scoped");

    expect(Object.keys(mock.updatePayloads[0])).toEqual(["notes", "updated_at"]);
  });

  it("returns idempotent success without update when note unchanged", async () => {
    const mock = createScopedSupabaseMock({
      task: { ...baseTask, notes: "Same" },
    });

    const result = await setJarvisGoalTaskNotes(mock.supabase, USER_ID, TASK_ID, "Same");

    expect(result).toEqual({
      success: true,
      taskId: TASK_ID,
      notes: "Same",
    });
    expect(mock.updateCallCount).toBe(0);
  });
});
