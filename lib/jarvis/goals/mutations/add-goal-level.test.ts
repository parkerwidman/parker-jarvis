import { beforeEach, describe, expect, it, vi } from "vitest";
import { addJarvisGoalLevel, mapAddGoalLevelError } from "./add-goal-level";
import { GOAL_LEVEL_NAME_MAX_LENGTH, GOAL_TASK_TITLE_MAX_LENGTH } from "./goal-task-mutation-shared";

const GOAL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LEVEL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

describe("addJarvisGoalLevel", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("B. rejects invalid goal UUID before RPC", async () => {
    const mock = createAddRpcMock(null);

    const result = await addJarvisGoalLevel(mock.supabase, "bad", "Level", "Task");

    expect(result).toEqual({ success: false, error: "Invalid goal." });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("C. rejects non-string goalId", async () => {
    const mock = createAddRpcMock(null);

    const result = await addJarvisGoalLevel(mock.supabase, 123, "Level", "Task");

    expect(result).toEqual({ success: false, error: "Invalid goal." });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("G/H. rejects blank and whitespace level names before RPC", async () => {
    const mock = createAddRpcMock(null);

    for (const name of ["", "   "]) {
      const result = await addJarvisGoalLevel(mock.supabase, GOAL_ID, name, "Task");
      expect(result.success).toBe(false);
    }

    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("I. rejects overlong level name before RPC", async () => {
    const mock = createAddRpcMock(null);

    const result = await addJarvisGoalLevel(
      mock.supabase,
      GOAL_ID,
      "a".repeat(GOAL_LEVEL_NAME_MAX_LENGTH + 1),
      "Task",
    );

    expect(result.success).toBe(false);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("J/K/L. rejects blank, whitespace, and overlong first task titles", async () => {
    const mock = createAddRpcMock(null);

    for (const title of ["", "   "]) {
      expect((await addJarvisGoalLevel(mock.supabase, GOAL_ID, "Level", title)).success).toBe(
        false,
      );
    }

    expect(
      (
        await addJarvisGoalLevel(
          mock.supabase,
          GOAL_ID,
          "Level",
          "a".repeat(GOAL_TASK_TITLE_MAX_LENGTH + 1),
        )
      ).success,
    ).toBe(false);

    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("D/E. maps archived and completed goal RPC codes", () => {
    expect(mapAddGoalLevelError("goal_archived")).toContain("Archived");
    expect(mapAddGoalLevelError("goal_completed")).toContain("historical");
  });

  it("M/N. calls RPC with trimmed goal id, level name, and first task only", async () => {
    const mock = createAddRpcMock({
      success: true,
      code: "added",
      level_id: LEVEL_ID,
      task_id: TASK_ID,
      goal_id: GOAL_ID,
      goal_status: "active",
    });

    const result = await addJarvisGoalLevel(
      mock.supabase,
      GOAL_ID,
      "  New level  ",
      "  First task  ",
    );

    expect(result).toEqual({
      success: true,
      code: "added",
      levelId: LEVEL_ID,
      taskId: TASK_ID,
      goalId: GOAL_ID,
      goalStatus: "active",
    });
    expect(mock.rpc).toHaveBeenCalledWith("add_jarvis_goal_level", {
      p_goal_id: GOAL_ID,
      p_level_name: "New level",
      p_first_task_title: "First task",
    });
  });

  it("Y. does not pass client user or structural fields to RPC", async () => {
    const mock = createAddRpcMock({
      success: true,
      code: "added",
      level_id: LEVEL_ID,
      task_id: TASK_ID,
      goal_id: GOAL_ID,
      goal_status: "active",
    });

    await addJarvisGoalLevel(mock.supabase, GOAL_ID, "Level", "Task");

    expect(mock.rpc).toHaveBeenCalledWith("add_jarvis_goal_level", {
      p_goal_id: GOAL_ID,
      p_level_name: "Level",
      p_first_task_title: "Task",
    });
  });

  it("A. maps unauthenticated RPC code", async () => {
    const mock = createAddRpcMock({ success: false, code: "unauthenticated" });

    const result = await addJarvisGoalLevel(mock.supabase, GOAL_ID, "Level", "Task");

    expect(result).toEqual({
      success: false,
      error: "You must be signed in to add a level.",
    });
  });
});
