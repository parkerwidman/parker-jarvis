import { beforeEach, describe, expect, it, vi } from "vitest";
import { addJarvisGoalTask, mapAddGoalTaskError } from "./add-goal-task";

const LEVEL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GOAL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createAddRpcMock(rpcResult: unknown, rpcError: Error | null = null) {
  const rpc = vi.fn(async () => ({
    data: rpcResult,
    error: rpcError,
  }));

  return {
    supabase: { rpc } as never,
    rpc,
  };
}

describe("addJarvisGoalTask", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("B. rejects invalid level UUID before RPC", async () => {
    const mock = createAddRpcMock(null);

    const result = await addJarvisGoalTask(mock.supabase, "bad", "Task");

    expect(result).toEqual({ success: false, error: "Invalid level." });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("C. rejects non-string levelId", async () => {
    const mock = createAddRpcMock(null);

    const result = await addJarvisGoalTask(mock.supabase, 123, "Task");

    expect(result).toEqual({ success: false, error: "Invalid level." });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("G/H. rejects blank and whitespace-only titles before RPC", async () => {
    const mock = createAddRpcMock(null);

    for (const title of ["", "   "]) {
      const result = await addJarvisGoalTask(mock.supabase, LEVEL_ID, title);
      expect(result.success).toBe(false);
    }

    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("I. rejects non-string title before RPC", async () => {
    const mock = createAddRpcMock(null);

    const result = await addJarvisGoalTask(mock.supabase, LEVEL_ID, null);

    expect(result.success).toBe(false);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("E/F. maps archived and completed goal RPC codes", () => {
    expect(mapAddGoalTaskError("goal_archived")).toContain("Archived");
    expect(mapAddGoalTaskError("goal_completed")).toContain("historical");
  });

  it("K. calls RPC with level id and title only", async () => {
    const mock = createAddRpcMock({
      success: true,
      code: "added",
      task_id: TASK_ID,
      goal_id: GOAL_ID,
      goal_status: "active",
    });

    const result = await addJarvisGoalTask(mock.supabase, LEVEL_ID, "  New task  ");

    expect(result).toEqual({
      success: true,
      code: "added",
      taskId: TASK_ID,
      goalId: GOAL_ID,
      goalStatus: "active",
    });
    expect(mock.rpc).toHaveBeenCalledWith("add_jarvis_goal_task", {
      p_level_id: LEVEL_ID,
      p_title: "New task",
    });
  });

  it("U. does not pass client user or position fields to RPC", async () => {
    const mock = createAddRpcMock({
      success: true,
      code: "added",
      task_id: TASK_ID,
      goal_id: GOAL_ID,
      goal_status: "active",
    });

    await addJarvisGoalTask(mock.supabase, LEVEL_ID, "Task");

    expect(mock.rpc).toHaveBeenCalledWith("add_jarvis_goal_task", {
      p_level_id: LEVEL_ID,
      p_title: "Task",
    });
  });

  it("A. maps unauthenticated RPC code", async () => {
    const mock = createAddRpcMock({ success: false, code: "unauthenticated" });

    const result = await addJarvisGoalTask(mock.supabase, LEVEL_ID, "Task");

    expect(result).toEqual({
      success: false,
      error: "You must be signed in to add a task.",
    });
  });
});
