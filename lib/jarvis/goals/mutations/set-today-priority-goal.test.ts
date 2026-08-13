import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearJarvisGoalPriority,
  setJarvisGoalPriority,
} from "./set-today-priority-goal";

const USER_ID = "99999999-9999-4999-8999-999999999999";
const GOAL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function createPrioritySupabaseMock(rpcResult: unknown = { success: true, goal_id: GOAL_A, domain: "personal", goal_type: "short_term" }) {
  const rpc = vi.fn(async () => ({ data: rpcResult, error: null }));

  return {
    supabase: { rpc },
    rpc,
  };
}

describe("setJarvisGoalPriority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("A. rejects unauthenticated user before RPC call", async () => {
    const { supabase, rpc } = createPrioritySupabaseMock();

    const result = await setJarvisGoalPriority(supabase as never, null, GOAL_A);

    expect(result).toEqual({
      success: false,
      error: "You must be signed in to update Current Priority.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls set_jarvis_goal_priority RPC with goal id", async () => {
    const { supabase, rpc } = createPrioritySupabaseMock();

    const result = await setJarvisGoalPriority(supabase as never, USER_ID, GOAL_A);

    expect(result).toEqual({
      success: true,
      goalId: GOAL_A,
      domain: "personal",
      goalType: "short_term",
    });
    expect(rpc).toHaveBeenCalledWith("set_jarvis_goal_priority", {
      p_goal_id: GOAL_A,
    });
  });

  it("maps RPC failure codes to user-facing errors", async () => {
    const { supabase } = createPrioritySupabaseMock({
      success: false,
      code: "goal_completed",
    });

    const result = await setJarvisGoalPriority(supabase as never, USER_ID, GOAL_A);

    expect(result).toEqual({
      success: false,
      error: "Completed goals cannot be Current Priority.",
    });
  });
});

describe("clearJarvisGoalPriority", () => {
  it("calls clear_jarvis_goal_priority RPC with domain and horizon", async () => {
    const { supabase, rpc } = createPrioritySupabaseMock({ success: true });

    const result = await clearJarvisGoalPriority(
      supabase as never,
      USER_ID,
      "melusi",
      "three_month",
    );

    expect(result).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("clear_jarvis_goal_priority", {
      p_domain: "melusi",
      p_goal_type: "three_month",
    });
  });
});
