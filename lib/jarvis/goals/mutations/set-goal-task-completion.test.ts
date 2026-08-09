import { describe, expect, it, vi } from "vitest";
import {
  mapGoalTaskCompletionError,
  setJarvisGoalTaskCompletion,
} from "./set-goal-task-completion";

const TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function createSupabaseMock(rpcResult: unknown, rpcError: Error | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data: rpcResult, error: rpcError });

  return {
    supabase: { rpc } as never,
    rpc,
  };
}

describe("setJarvisGoalTaskCompletion", () => {
  it("A. rejects invalid task ids without calling RPC", async () => {
    const { supabase, rpc } = createSupabaseMock(null);

    const result = await setJarvisGoalTaskCompletion(supabase, "bad-id", true);

    expect(result).toEqual({ success: false, error: "Invalid task." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects non-string taskId without calling RPC", async () => {
    const { supabase, rpc } = createSupabaseMock(null);

    const result = await setJarvisGoalTaskCompletion(supabase, null, true);

    expect(result).toEqual({ success: false, error: "Invalid task." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects non-boolean completed without calling RPC", async () => {
    const { supabase, rpc } = createSupabaseMock(null);

    const result = await setJarvisGoalTaskCompletion(
      supabase,
      TASK_ID,
      "true" as never,
    );

    expect(result).toEqual({ success: false, error: "Invalid completion state." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects null completed without calling RPC", async () => {
    const { supabase, rpc } = createSupabaseMock(null);

    const result = await setJarvisGoalTaskCompletion(supabase, TASK_ID, null);

    expect(result).toEqual({ success: false, error: "Invalid completion state." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("E/F. maps successful completion RPC payload", async () => {
    const { supabase } = createSupabaseMock({
      success: true,
      code: "completed",
      task_id: TASK_ID,
      goal_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      goal_status: "active",
      goal_completed_at: null,
    });

    const result = await setJarvisGoalTaskCompletion(supabase, TASK_ID, true);

    expect(result).toEqual({
      success: true,
      code: "completed",
      taskId: TASK_ID,
      goalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      goalStatus: "active",
      goalCompletedAt: null,
    });
  });

  it("I. maps already_done success code", async () => {
    const completedAt = "2026-08-08T12:00:00.000Z";
    const { supabase } = createSupabaseMock({
      success: true,
      code: "already_done",
      task_id: TASK_ID,
      goal_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      goal_status: "completed",
      goal_completed_at: completedAt,
    });

    const result = await setJarvisGoalTaskCompletion(supabase, TASK_ID, true);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.code).toBe("already_done");
      expect(result.goalCompletedAt).toBe(completedAt);
    }
  });

  it("K. maps level_locked to a controlled user-facing error", async () => {
    const { supabase } = createSupabaseMock({
      success: false,
      code: "level_locked",
    });

    const result = await setJarvisGoalTaskCompletion(supabase, TASK_ID, true);

    expect(result).toEqual({
      success: false,
      error: "Complete earlier roadmap levels before this task.",
    });
  });

  it("D. maps not_goal_task for standalone tasks", async () => {
    const { supabase } = createSupabaseMock({
      success: false,
      code: "not_goal_task",
    });

    const result = await setJarvisGoalTaskCompletion(supabase, TASK_ID, true);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("This task is not part of a Jarvis goal.");
    }
  });

  it("maps malformed goal structure to a controlled user-facing error", async () => {
    const { supabase } = createSupabaseMock({
      success: false,
      code: "malformed_goal_structure",
    });

    const result = await setJarvisGoalTaskCompletion(supabase, TASK_ID, true);

    expect(result).toEqual({
      success: false,
      error:
        "This goal has inconsistent task attachments and cannot be updated safely.",
    });
  });

  it("maps invalid completion state from RPC", async () => {
    const { supabase } = createSupabaseMock({
      success: false,
      code: "invalid_completion_state",
    });

    const result = await setJarvisGoalTaskCompletion(supabase, TASK_ID, true);

    expect(result).toEqual({
      success: false,
      error: "Invalid completion state.",
    });
  });

  it("calls RPC with only task id and completed boolean", async () => {
    const { supabase, rpc } = createSupabaseMock({
      success: true,
      code: "reopened",
      task_id: TASK_ID,
      goal_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      goal_status: "active",
      goal_completed_at: null,
    });

    await setJarvisGoalTaskCompletion(supabase, TASK_ID, false);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("set_jarvis_goal_task_completion", {
      p_task_id: TASK_ID,
      p_completed: false,
    });
  });
});

describe("mapGoalTaskCompletionError", () => {
  it("returns fallback for unknown codes", () => {
    expect(mapGoalTaskCompletionError("unknown")).toBe(
      "Could not update task. Try again.",
    );
  });
});
