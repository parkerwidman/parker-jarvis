import { describe, expect, it, vi } from "vitest";
import {
  updateJarvisGoalMetadata,
  validateUpdateJarvisGoalMetadataInput,
} from "./update-goal-metadata";

const GOAL_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function createRpcMock(result: unknown) {
  const rpc = vi.fn(async () => ({ data: result, error: null }));
  return { supabase: { rpc } as never, rpc };
}

describe("validateUpdateJarvisGoalMetadataInput", () => {
  it("rejects empty update payloads", () => {
    expect(validateUpdateJarvisGoalMetadataInput({})).toEqual({
      ok: false,
      error: "No goal changes were provided.",
    });
  });

  it("accepts optional description and notes", () => {
    expect(
      validateUpdateJarvisGoalMetadataInput({
        description: "Overview",
        notes: "Follow-up details",
      }),
    ).toEqual({ ok: true });
  });

  it("accepts add, change, and clear target date inputs", () => {
    expect(validateUpdateJarvisGoalMetadataInput({ targetDate: "2026-12-01" })).toEqual({
      ok: true,
    });
    expect(validateUpdateJarvisGoalMetadataInput({ clearTargetDate: true })).toEqual({
      ok: true,
    });
  });
});

describe("updateJarvisGoalMetadata", () => {
  it("creates goal metadata without target date", async () => {
    const mock = createRpcMock({
      success: true,
      goal_id: GOAL_ID,
      title: "Goal",
      description: null,
      notes: null,
      target_date: null,
      domain: "personal",
      goal_type: "short_term",
      status: "active",
    });

    const result = await updateJarvisGoalMetadata(mock.supabase, USER_ID, GOAL_ID, {
      title: "Goal",
    });

    expect(result).toMatchObject({
      success: true,
      targetDate: null,
      notes: null,
    });
    expect(mock.rpc).toHaveBeenCalledWith(
      "update_jarvis_goal_metadata",
      expect.objectContaining({
        p_clear_target_date: false,
      }),
    );
  });

  it("sends notes and target date through the metadata RPC", async () => {
    const mock = createRpcMock({
      success: true,
      goal_id: GOAL_ID,
      title: "Goal",
      description: "Overview",
      notes: "Notes",
      target_date: "2026-12-01",
      domain: "personal",
      goal_type: "short_term",
      status: "active",
    });

    await updateJarvisGoalMetadata(mock.supabase, USER_ID, GOAL_ID, {
      description: "Overview",
      notes: "Notes",
      targetDate: "2026-12-01",
    });

    expect(mock.rpc).toHaveBeenCalledWith(
      "update_jarvis_goal_metadata",
      expect.objectContaining({
        p_description: "Overview",
        p_notes: "Notes",
        p_target_date: "2026-12-01",
        p_clear_target_date: false,
      }),
    );
  });

  it("sends empty strings when clearing optional text fields", async () => {
    const mock = createRpcMock({
      success: true,
      goal_id: GOAL_ID,
      title: "Goal",
      description: null,
      notes: null,
      target_date: null,
      domain: "personal",
      goal_type: "short_term",
      status: "active",
    });

    await updateJarvisGoalMetadata(mock.supabase, USER_ID, GOAL_ID, {
      description: "",
      notes: "   ",
    });

    expect(mock.rpc).toHaveBeenCalledWith(
      "update_jarvis_goal_metadata",
      expect.objectContaining({
        p_description: "",
        p_notes: "",
        p_clear_target_date: false,
      }),
    );
  });

  it("updates target date only with disambiguating clear flag", async () => {
    const mock = createRpcMock({
      success: true,
      goal_id: GOAL_ID,
      title: "Goal",
      description: null,
      notes: null,
      target_date: "2026-12-01",
      domain: "personal",
      goal_type: "short_term",
      status: "active",
    });

    await updateJarvisGoalMetadata(mock.supabase, USER_ID, GOAL_ID, {
      targetDate: "2026-12-01",
    });

    expect(mock.rpc).toHaveBeenCalledWith("update_jarvis_goal_metadata", {
      p_goal_id: GOAL_ID,
      p_target_date: "2026-12-01",
      p_clear_target_date: false,
    });
    expect(mock.rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_domain");
    expect(mock.rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_goal_type");
    expect(mock.rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_title");
  });

  it("updates notes only without sending domain or goal type", async () => {
    const mock = createRpcMock({
      success: true,
      goal_id: GOAL_ID,
      title: "Goal",
      description: null,
      notes: "Updated notes",
      target_date: null,
      domain: "personal",
      goal_type: "short_term",
      status: "active",
    });

    await updateJarvisGoalMetadata(mock.supabase, USER_ID, GOAL_ID, {
      notes: "Updated notes",
    });

    expect(mock.rpc).toHaveBeenCalledWith(
      "update_jarvis_goal_metadata",
      expect.objectContaining({
        p_notes: "Updated notes",
        p_clear_target_date: false,
      }),
    );
    expect(mock.rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_domain");
    expect(mock.rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_goal_type");
  });

  it("updates description only without sending domain or goal type", async () => {
    const mock = createRpcMock({
      success: true,
      goal_id: GOAL_ID,
      title: "Goal",
      description: "Updated overview",
      notes: null,
      target_date: null,
      domain: "personal",
      goal_type: "long_term",
      status: "active",
    });

    await updateJarvisGoalMetadata(mock.supabase, USER_ID, GOAL_ID, {
      description: "Updated overview",
    });

    expect(mock.rpc).toHaveBeenCalledWith(
      "update_jarvis_goal_metadata",
      expect.objectContaining({
        p_description: "Updated overview",
        p_clear_target_date: false,
      }),
    );
    expect(mock.rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_domain");
    expect(mock.rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_goal_type");
  });

  it("updates title only without sending domain or goal type", async () => {
    const mock = createRpcMock({
      success: true,
      goal_id: GOAL_ID,
      title: "Updated title",
      description: null,
      notes: null,
      target_date: null,
      domain: "personal",
      goal_type: "short_term",
      status: "active",
    });

    await updateJarvisGoalMetadata(mock.supabase, USER_ID, GOAL_ID, {
      title: "Updated title",
    });

    expect(mock.rpc).toHaveBeenCalledWith(
      "update_jarvis_goal_metadata",
      expect.objectContaining({
        p_title: "Updated title",
        p_clear_target_date: false,
      }),
    );
    expect(mock.rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_domain");
    expect(mock.rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_goal_type");
  });

  it("updates domain only without sending goal type", async () => {
    const mock = createRpcMock({
      success: true,
      goal_id: GOAL_ID,
      title: "Goal",
      description: null,
      notes: null,
      target_date: null,
      domain: "melusi",
      goal_type: "long_term",
      status: "active",
    });

    await updateJarvisGoalMetadata(mock.supabase, USER_ID, GOAL_ID, {
      domain: "melusi",
    });

    expect(mock.rpc).toHaveBeenCalledWith(
      "update_jarvis_goal_metadata",
      expect.objectContaining({
        p_domain: "melusi",
        p_clear_target_date: false,
      }),
    );
    expect(mock.rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_goal_type");
  });

  it("updates goal type only without sending domain", async () => {
    const mock = createRpcMock({
      success: true,
      goal_id: GOAL_ID,
      title: "Goal",
      description: null,
      notes: null,
      target_date: null,
      domain: "personal",
      goal_type: "three_month",
      status: "active",
    });

    await updateJarvisGoalMetadata(mock.supabase, USER_ID, GOAL_ID, {
      goalType: "three_month",
    });

    expect(mock.rpc).toHaveBeenCalledWith(
      "update_jarvis_goal_metadata",
      expect.objectContaining({
        p_goal_type: "three_month",
        p_clear_target_date: false,
      }),
    );
    expect(mock.rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_domain");
  });

  it("clears target date through the metadata RPC", async () => {
    const mock = createRpcMock({
      success: true,
      goal_id: GOAL_ID,
      title: "Goal",
      description: null,
      notes: null,
      target_date: null,
      domain: "personal",
      goal_type: "short_term",
      status: "active",
    });

    await updateJarvisGoalMetadata(mock.supabase, USER_ID, GOAL_ID, {
      clearTargetDate: true,
    });

    expect(mock.rpc).toHaveBeenCalledWith(
      "update_jarvis_goal_metadata",
      expect.objectContaining({
        p_clear_target_date: true,
      }),
    );
  });

  it("surfaces rpc error codes in server logs without changing user message", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        code: "PGRST203",
        message: "Could not choose the best candidate function",
        details: "update_jarvis_goal_metadata overload ambiguity",
        hint: null,
      },
    }));

    const result = await updateJarvisGoalMetadata(
      { rpc } as never,
      USER_ID,
      GOAL_ID,
      { targetDate: "2026-12-01" },
    );

    expect(result).toEqual({
      success: false,
      error: "Could not update goal. Try again.",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "[updateJarvisGoalMetadata] rpc failed",
      expect.objectContaining({ code: "PGRST203" }),
    );

    errorSpy.mockRestore();
  });
});
