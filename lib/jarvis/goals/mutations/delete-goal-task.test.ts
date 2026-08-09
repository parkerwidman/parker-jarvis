import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteJarvisGoalTask, mapDeleteGoalTaskError } from "./delete-goal-task";

const TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GOAL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createDeleteRpcMock(rpcResult: unknown, rpcError: Error | null = null) {
  const rpc = vi.fn(async () => ({
    data: rpcResult,
    error: rpcError,
  }));

  return {
    supabase: { rpc } as never,
    rpc,
  };
}

describe("deleteJarvisGoalTask", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("AQ. rejects invalid task UUID before RPC", async () => {
    const mock = createDeleteRpcMock(null);

    const result = await deleteJarvisGoalTask(mock.supabase, "bad");

    expect(result).toEqual({ success: false, error: "Invalid task." });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("AQ. rejects non-string taskId", async () => {
    const mock = createDeleteRpcMock(null);

    const result = await deleteJarvisGoalTask(mock.supabase, 123);

    expect(result).toEqual({ success: false, error: "Invalid task." });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("AU/AV. maps completed goal and last-task RPC codes", () => {
    expect(mapDeleteGoalTaskError("goal_completed")).toContain("historical");
    expect(mapDeleteGoalTaskError("last_task_in_level")).toContain("at least one task");
  });

  it("AW. successful delete returns ids", async () => {
    const mock = createDeleteRpcMock({
      success: true,
      code: "deleted",
      task_id: TASK_ID,
      goal_id: GOAL_ID,
      goal_status: "active",
    });

    const result = await deleteJarvisGoalTask(mock.supabase, TASK_ID);

    expect(result).toEqual({
      success: true,
      code: "deleted",
      taskId: TASK_ID,
      goalId: GOAL_ID,
      goalStatus: "active",
    });
    expect(mock.rpc).toHaveBeenCalledWith("delete_jarvis_goal_task", {
      p_task_id: TASK_ID,
    });
  });

  it("AP. maps unauthenticated RPC code", async () => {
    const mock = createDeleteRpcMock({ success: false, code: "unauthenticated" });

    const result = await deleteJarvisGoalTask(mock.supabase, TASK_ID);

    expect(result).toEqual({
      success: false,
      error: "You must be signed in to delete this task.",
    });
  });
});
