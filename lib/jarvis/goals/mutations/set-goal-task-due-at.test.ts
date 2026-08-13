import { beforeEach, describe, expect, it, vi } from "vitest";
import { setJarvisGoalTaskDueAt } from "./set-goal-task-due-at";

const TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

vi.mock("./goal-task-mutation-shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./goal-task-mutation-shared")>();
  return {
    ...actual,
    loadGoalTaskMutationContext: vi.fn(async () => ({
      taskId: TASK_ID,
      goalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      goalStatus: "active",
    })),
  };
});

function createRpcMock(result: unknown) {
  const rpc = vi.fn(async () => ({ data: result, error: null }));
  return { supabase: { rpc } as never, rpc };
}

describe("setJarvisGoalTaskDueAt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates task due date as null when omitted", async () => {
    const mock = createRpcMock({
      success: true,
      task_id: TASK_ID,
      due_at: null,
    });

    const result = await setJarvisGoalTaskDueAt(mock.supabase, USER_ID, TASK_ID, null);

    expect(result).toEqual({
      success: true,
      taskId: TASK_ID,
      dueAt: null,
    });
    expect(mock.rpc).toHaveBeenCalledWith("set_jarvis_goal_task_due_at", {
      p_task_id: TASK_ID,
      p_due_at: null,
      p_clear_due_at: false,
    });
  });

  it("sets due date from YYYY-MM-DD input", async () => {
    const mock = createRpcMock({
      success: true,
      task_id: TASK_ID,
      due_at: "2026-12-01T12:00:00.000Z",
    });

    await setJarvisGoalTaskDueAt(mock.supabase, USER_ID, TASK_ID, "2026-12-01");

    expect(mock.rpc).toHaveBeenCalledWith("set_jarvis_goal_task_due_at", {
      p_task_id: TASK_ID,
      p_due_at: "2026-12-01T12:00:00.000Z",
      p_clear_due_at: false,
    });
  });

  it("clears due date when requested", async () => {
    const mock = createRpcMock({
      success: true,
      task_id: TASK_ID,
      due_at: null,
    });

    await setJarvisGoalTaskDueAt(mock.supabase, USER_ID, TASK_ID, null, true);

    expect(mock.rpc).toHaveBeenCalledWith("set_jarvis_goal_task_due_at", {
      p_task_id: TASK_ID,
      p_due_at: null,
      p_clear_due_at: true,
    });
  });
});
