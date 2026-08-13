import { describe, expect, it, vi } from "vitest";
import { archiveJarvisGoal } from "./archive-goal";
import { restoreJarvisGoal } from "./restore-goal";
import {
  updateJarvisGoalMetadata,
  validateUpdateJarvisGoalMetadataInput,
} from "./update-goal-metadata";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const GOAL_ID = "22222222-2222-4222-8222-222222222222";

function createRpcMock(result: unknown) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: result, error: null }),
  };
}

describe("validateUpdateJarvisGoalMetadataInput", () => {
  it("rejects empty patch", () => {
    expect(validateUpdateJarvisGoalMetadataInput({})).toEqual({
      ok: false,
      error: "No goal changes were provided.",
    });
  });

  it("rejects invalid title length", () => {
    expect(validateUpdateJarvisGoalMetadataInput({ title: "   " })).toEqual({
      ok: false,
      error: "Goal title must be between 1 and 200 characters.",
    });
  });
});

describe("updateJarvisGoalMetadata", () => {
  it("passes only provided fields to RPC", async () => {
    const supabase = createRpcMock({
      success: true,
      code: "updated",
      goal_id: GOAL_ID,
      title: "Renamed",
      domain: "personal",
      goal_type: "short_term",
      status: "active",
    });

    const result = await updateJarvisGoalMetadata(supabase as never, USER_ID, GOAL_ID, {
      title: "Renamed",
    });

    expect(result.success).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("update_jarvis_goal_metadata", {
      p_goal_id: GOAL_ID,
      p_title: "Renamed",
      p_clear_target_date: false,
    });
  });

  it("maps archived rejection", async () => {
    const supabase = createRpcMock({ success: false, code: "goal_archived" });

    const result = await updateJarvisGoalMetadata(supabase as never, USER_ID, GOAL_ID, {
      domain: "melusi",
    });

    expect(result).toEqual({
      success: false,
      error: "Archived goals cannot be edited. Restore the goal first.",
    });
  });
});

describe("archiveJarvisGoal", () => {
  it("returns archived goal payload", async () => {
    const supabase = createRpcMock({
      success: true,
      code: "archived",
      goal_id: GOAL_ID,
      status: "archived",
      completed_at: null,
    });

    const result = await archiveJarvisGoal(supabase as never, USER_ID, GOAL_ID);

    expect(result).toMatchObject({
      success: true,
      code: "archived",
      goalId: GOAL_ID,
      status: "archived",
    });
    expect(supabase.rpc).toHaveBeenCalledWith("archive_jarvis_goal", {
      p_goal_id: GOAL_ID,
    });
  });
});

describe("restoreJarvisGoal", () => {
  it("returns reconciled status", async () => {
    const supabase = createRpcMock({
      success: true,
      code: "restored",
      goal_id: GOAL_ID,
      status: "active",
      completed_at: null,
    });

    const result = await restoreJarvisGoal(supabase as never, USER_ID, GOAL_ID);

    expect(result).toMatchObject({
      success: true,
      code: "restored",
      goalId: GOAL_ID,
      status: "active",
    });
  });
});
