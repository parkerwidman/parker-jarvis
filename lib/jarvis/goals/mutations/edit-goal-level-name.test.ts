import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOAL_LEVEL_NAME_MAX_LENGTH } from "./goal-task-mutation-shared";
import {
  createScopedSupabaseMock,
  GOAL_ID,
  LEVEL_ID,
  USER_ID,
} from "./goal-task-mutation-test-helpers";
import { editJarvisGoalLevelName } from "./edit-goal-level-name";

describe("editJarvisGoalLevelName", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("AA. rejects unauthenticated userId before DB call", async () => {
    const mock = createScopedSupabaseMock({
      level: { id: LEVEL_ID, goal_id: GOAL_ID, name: "Foundation" },
    });

    const result = await editJarvisGoalLevelName(mock.supabase, null, LEVEL_ID, "New");

    expect(result).toEqual({
      success: false,
      error: "You must be signed in to update this level.",
    });
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("AB. rejects invalid levelId", async () => {
    const mock = createScopedSupabaseMock({
      level: { id: LEVEL_ID, goal_id: GOAL_ID, name: "Foundation" },
    });

    const result = await editJarvisGoalLevelName(mock.supabase, USER_ID, null, "New");

    expect(result).toEqual({ success: false, error: "Invalid level." });
    expect(mock.updateCallCount).toBe(0);
  });

  it("AD. rejects archived goal", async () => {
    const mock = createScopedSupabaseMock({
      level: { id: LEVEL_ID, goal_id: GOAL_ID, name: "Foundation" },
      goal: { id: GOAL_ID, status: "archived" },
    });

    const result = await editJarvisGoalLevelName(mock.supabase, USER_ID, LEVEL_ID, "New");

    expect(result.success).toBe(false);
    expect(mock.updateCallCount).toBe(0);
  });

  it("AH. allows completed-goal level name edit", async () => {
    const mock = createScopedSupabaseMock({
      level: { id: LEVEL_ID, goal_id: GOAL_ID, name: "Foundation" },
      goal: { id: GOAL_ID, status: "completed" },
      updateResult: () => ({ id: LEVEL_ID, name: "Corrected level" }),
    });

    const result = await editJarvisGoalLevelName(
      mock.supabase,
      USER_ID,
      LEVEL_ID,
      "  Corrected level  ",
    );

    expect(result).toEqual({
      success: true,
      levelId: LEVEL_ID,
      name: "Corrected level",
    });
  });

  it("AJ/AK. rejects blank and overlong names", async () => {
    const mock = createScopedSupabaseMock({
      level: { id: LEVEL_ID, goal_id: GOAL_ID, name: "Foundation" },
    });

    expect((await editJarvisGoalLevelName(mock.supabase, USER_ID, LEVEL_ID, "   ")).success).toBe(
      false,
    );
    expect(
      (
        await editJarvisGoalLevelName(
          mock.supabase,
          USER_ID,
          LEVEL_ID,
          "a".repeat(GOAL_LEVEL_NAME_MAX_LENGTH + 1),
        )
      ).success,
    ).toBe(false);
    expect(mock.updateCallCount).toBe(0);
  });

  it("AL. scopes UPDATE by id and user_id", async () => {
    const mock = createScopedSupabaseMock({
      level: { id: LEVEL_ID, goal_id: GOAL_ID, name: "Foundation" },
      updateResult: () => ({ id: LEVEL_ID, name: "Renamed" }),
    });

    await editJarvisGoalLevelName(mock.supabase, USER_ID, LEVEL_ID, "Renamed");

    expect(mock.updateFilters[0]).toEqual({
      "eq:id": LEVEL_ID,
      "eq:user_id": USER_ID,
    });
  });

  it("AL. updates only name and updated_at", async () => {
    const mock = createScopedSupabaseMock({
      level: { id: LEVEL_ID, goal_id: GOAL_ID, name: "Foundation" },
      updateResult: () => ({ id: LEVEL_ID, name: "Renamed" }),
    });

    await editJarvisGoalLevelName(mock.supabase, USER_ID, LEVEL_ID, "Renamed");

    expect(mock.updatePayloads[0]).toEqual({
      name: "Renamed",
      updated_at: expect.any(String),
    });
    expect(Object.keys(mock.updatePayloads[0] ?? {})).toEqual(["name", "updated_at"]);
  });
});
