import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapMoveGoalTaskError, moveJarvisGoalTask } from "./move-goal-task";

const TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GOAL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LEVEL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function createMoveRpcMock(rpcResult: unknown, rpcError: Error | null = null) {
  const rpc = vi.fn(async () => ({
    data: rpcResult,
    error: rpcError,
  }));

  return {
    supabase: { rpc } as never,
    rpc,
  };
}

describe("moveJarvisGoalTask", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("rejects invalid task UUID before RPC", async () => {
    const mock = createMoveRpcMock(null);

    const result = await moveJarvisGoalTask(mock.supabase, "bad", "up");

    expect(result).toEqual({ success: false, error: "Invalid task." });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid direction before RPC", async () => {
    const mock = createMoveRpcMock(null);

    const result = await moveJarvisGoalTask(mock.supabase, TASK_ID, "sideways");

    expect(result).toEqual({ success: false, error: "Invalid move direction." });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("calls RPC with task id and direction only", async () => {
    const mock = createMoveRpcMock({
      success: true,
      code: "moved",
      task_id: TASK_ID,
      goal_id: GOAL_ID,
      level_id: LEVEL_ID,
      direction: "down",
      old_position: 10,
      new_position: 20,
    });

    const result = await moveJarvisGoalTask(mock.supabase, TASK_ID, "down");

    expect(result.success).toBe(true);
    expect(mock.rpc).toHaveBeenCalledWith("move_jarvis_goal_task", {
      p_task_id: TASK_ID,
      p_direction: "down",
    });
  });

  it("maps task_busy RPC code", async () => {
    const mock = createMoveRpcMock({ success: false, code: "task_busy" });

    const result = await moveJarvisGoalTask(mock.supabase, TASK_ID, "up");

    expect(result).toEqual({
      success: false,
      error: "This task is being updated. Try moving it again.",
    });
    expect(mapMoveGoalTaskError("task_busy")).toBe(
      "This task is being updated. Try moving it again.",
    );
  });

  it("maps already_last boundary as success", async () => {
    const mock = createMoveRpcMock({
      success: true,
      code: "already_last",
      task_id: TASK_ID,
      goal_id: GOAL_ID,
      level_id: LEVEL_ID,
      direction: "down",
      old_position: 20,
      new_position: 20,
    });

    const result = await moveJarvisGoalTask(mock.supabase, TASK_ID, "down");

    expect(result).toMatchObject({ success: true, code: "already_last" });
  });
});
