import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapMoveGoalLevelError, moveJarvisGoalLevel } from "./move-goal-level";

const LEVEL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GOAL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

describe("moveJarvisGoalLevel", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("rejects invalid level UUID before RPC", async () => {
    const mock = createMoveRpcMock(null);

    const result = await moveJarvisGoalLevel(mock.supabase, "bad", "up");

    expect(result).toEqual({ success: false, error: "Invalid level." });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid direction before RPC", async () => {
    const mock = createMoveRpcMock(null);

    const result = await moveJarvisGoalLevel(mock.supabase, LEVEL_ID, "left");

    expect(result).toEqual({ success: false, error: "Invalid move direction." });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("calls RPC with level id and direction only", async () => {
    const mock = createMoveRpcMock({
      success: true,
      code: "moved",
      level_id: LEVEL_ID,
      goal_id: GOAL_ID,
      direction: "up",
      old_position: 20,
      new_position: 10,
    });

    const result = await moveJarvisGoalLevel(mock.supabase, LEVEL_ID, "up");

    expect(result.success).toBe(true);
    expect(mock.rpc).toHaveBeenCalledWith("move_jarvis_goal_level", {
      p_level_id: LEVEL_ID,
      p_direction: "up",
    });
  });

  it("maps boundary already_first as success", async () => {
    const mock = createMoveRpcMock({
      success: true,
      code: "already_first",
      level_id: LEVEL_ID,
      goal_id: GOAL_ID,
      direction: "up",
      old_position: 10,
      new_position: 10,
    });

    const result = await moveJarvisGoalLevel(mock.supabase, LEVEL_ID, "up");

    expect(result).toMatchObject({ success: true, code: "already_first" });
  });

  it("maps unauthenticated RPC code", async () => {
    const mock = createMoveRpcMock({ success: false, code: "unauthenticated" });

    const result = await moveJarvisGoalLevel(mock.supabase, LEVEL_ID, "down");

    expect(result).toEqual({
      success: false,
      error: "You must be signed in to reorder this level.",
    });
  });

  it("maps goal_completed and position_overflow", () => {
    expect(mapMoveGoalLevelError("goal_completed")).toContain("completed goal");
    expect(mapMoveGoalLevelError("position_overflow")).toContain("can't be reordered");
  });
});
