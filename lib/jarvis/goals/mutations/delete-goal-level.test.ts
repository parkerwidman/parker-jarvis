import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteJarvisGoalLevel, mapDeleteGoalLevelError } from "./delete-goal-level";

const LEVEL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
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

describe("deleteJarvisGoalLevel", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("AS. rejects invalid level UUID before RPC", async () => {
    const mock = createDeleteRpcMock(null);

    const result = await deleteJarvisGoalLevel(mock.supabase, "bad");

    expect(result).toEqual({ success: false, error: "Invalid level." });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("AT. rejects non-string levelId", async () => {
    const mock = createDeleteRpcMock(null);

    const result = await deleteJarvisGoalLevel(mock.supabase, null);

    expect(result).toEqual({ success: false, error: "Invalid level." });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("AU/AV. maps archived and completed goal RPC codes", () => {
    expect(mapDeleteGoalLevelError("goal_archived")).toContain("Archived");
    expect(mapDeleteGoalLevelError("goal_completed")).toContain("historical");
  });

  it("AW. maps last_level_in_goal RPC code", () => {
    expect(mapDeleteGoalLevelError("last_level_in_goal")).toContain("at least one level");
  });

  it("AY. calls RPC with level id only", async () => {
    const mock = createDeleteRpcMock({
      success: true,
      code: "deleted",
      level_id: LEVEL_ID,
      goal_id: GOAL_ID,
      deleted_task_count: 2,
      goal_status: "active",
    });

    const result = await deleteJarvisGoalLevel(mock.supabase, LEVEL_ID);

    expect(result).toEqual({
      success: true,
      code: "deleted",
      levelId: LEVEL_ID,
      goalId: GOAL_ID,
      deletedTaskCount: 2,
      goalStatus: "active",
    });
    expect(mock.rpc).toHaveBeenCalledWith("delete_jarvis_goal_level", {
      p_level_id: LEVEL_ID,
    });
  });

  it("AR. maps unauthenticated RPC code", async () => {
    const mock = createDeleteRpcMock({ success: false, code: "unauthenticated" });

    const result = await deleteJarvisGoalLevel(mock.supabase, LEVEL_ID);

    expect(result).toEqual({
      success: false,
      error: "You must be signed in to delete a level.",
    });
  });

  it("maps level_busy RPC code to controlled retry message", async () => {
    const mock = createDeleteRpcMock({ success: false, code: "level_busy" });

    const result = await deleteJarvisGoalLevel(mock.supabase, LEVEL_ID);

    expect(result).toEqual({
      success: false,
      error: "This level is being updated. Try deleting it again.",
    });
    expect(mapDeleteGoalLevelError("level_busy")).toBe(
      "This level is being updated. Try deleting it again.",
    );
  });
});
