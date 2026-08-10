import { beforeEach, describe, expect, it, vi } from "vitest";

const { setJarvisGoalTaskCompletionMock } = vi.hoisted(() => ({
  setJarvisGoalTaskCompletionMock: vi.fn(),
}));

vi.mock("@/lib/jarvis/goals/mutations/set-goal-task-completion", () => ({
  setJarvisGoalTaskCompletion: setJarvisGoalTaskCompletionMock,
}));

import { completeTask } from "./task-tools";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STANDALONE_TASK_ID = "11111111-1111-4111-8111-111111111111";
const GOAL_TASK_ID = "22222222-2222-4222-8222-222222222222";
const GOAL_ID = "33333333-3333-4333-8333-333333333333";

const TASK_ROW = {
  id: STANDALONE_TASK_ID,
  title: "Standalone task",
  status: "done",
  priority: "medium",
  due_at: null,
  completed_at: "2026-08-09T00:00:00.000Z",
  created_at: "2026-08-01T00:00:00.000Z",
};

function createSupabaseMock(options: {
  initialGoalId?: string | null;
  attachmentMissing?: boolean;
  standaloneUpdateError?: boolean;
  retryGoalId?: string | null;
  retryAttachmentMissing?: boolean;
}) {
  const isGuard = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: options.standaloneUpdateError ? null : TASK_ROW,
        error: options.standaloneUpdateError
          ? { code: "PGRST116", message: "0 rows" }
          : null,
      }),
    }),
  });

  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: isGuard,
      }),
    }),
  });

  let goalIdReadCount = 0;
  const select = vi.fn().mockImplementation((columns: string) => {
    if (columns === "goal_id") {
      goalIdReadCount += 1;
      const isRetryRead = goalIdReadCount > 1;

      return {
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data:
                (isRetryRead && options.retryAttachmentMissing) ||
                (!isRetryRead && options.attachmentMissing)
                  ? null
                  : {
                      goal_id: isRetryRead
                        ? (options.retryGoalId ?? null)
                        : (options.initialGoalId ?? null),
                    },
              error: null,
            }),
          }),
        }),
      };
    }

    return {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              ...TASK_ROW,
              id: GOAL_TASK_ID,
              title: "Goal task",
            },
            error: null,
          }),
        }),
      }),
    };
  });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table !== "tasks") {
      throw new Error(`Unexpected table ${table}`);
    }

    return { select, update };
  });

  return { supabase: { from } as never, update, isGuard };
}

describe("completeTask unified dispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes standalone tasks through generic completion", async () => {
    const { supabase, update, isGuard } = createSupabaseMock({
      initialGoalId: null,
    });

    const result = await completeTask(supabase, USER_ID, {
      taskId: STANDALONE_TASK_ID,
    });

    expect(result).toEqual({
      success: true,
      task: TASK_ROW,
      goalTaskCompleted: false,
    });
    expect(setJarvisGoalTaskCompletionMock).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
    expect(isGuard).toHaveBeenCalledWith("goal_id", null);
  });

  it("routes goal-linked tasks through Goals-aware completion", async () => {
    const { supabase, update } = createSupabaseMock({ initialGoalId: GOAL_ID });

    setJarvisGoalTaskCompletionMock.mockResolvedValue({
      success: true,
      code: "completed",
      taskId: GOAL_TASK_ID,
      goalId: GOAL_ID,
      goalStatus: "active",
      goalCompletedAt: null,
    });

    const result = await completeTask(supabase, USER_ID, {
      taskId: GOAL_TASK_ID,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.goalTaskCompleted).toBe(true);
      expect(result.task.id).toBe(GOAL_TASK_ID);
    }
    expect(setJarvisGoalTaskCompletionMock).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it("retries through Goals RPC when standalone UPDATE hits zero rows after attachment change", async () => {
    const { supabase, isGuard } = createSupabaseMock({
      initialGoalId: null,
      standaloneUpdateError: true,
      retryGoalId: GOAL_ID,
    });

    setJarvisGoalTaskCompletionMock.mockResolvedValue({
      success: true,
      code: "completed",
      taskId: STANDALONE_TASK_ID,
      goalId: GOAL_ID,
      goalStatus: "active",
      goalCompletedAt: null,
    });

    const result = await completeTask(supabase, USER_ID, {
      taskId: STANDALONE_TASK_ID,
    });

    expect(isGuard).toHaveBeenCalledWith("goal_id", null);
    expect(setJarvisGoalTaskCompletionMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.goalTaskCompleted).toBe(true);
    }
  });

  it("does not fall back to standalone completion for malformed goal attachments on retry", async () => {
    const { supabase } = createSupabaseMock({
      initialGoalId: null,
      standaloneUpdateError: true,
      retryGoalId: GOAL_ID,
    });

    setJarvisGoalTaskCompletionMock.mockResolvedValue({
      success: false,
      error: "This goal task has an invalid attachment.",
    });

    const result = await completeTask(supabase, USER_ID, {
      taskId: STANDALONE_TASK_ID,
    });

    expect(result).toEqual({
      success: false,
      error: "This goal task has an invalid attachment.",
    });
    expect(setJarvisGoalTaskCompletionMock).toHaveBeenCalledTimes(1);
  });

  it("returns stable not-found when retry re-read finds no owned task", async () => {
    const { supabase } = createSupabaseMock({
      initialGoalId: null,
      standaloneUpdateError: true,
      retryAttachmentMissing: true,
    });

    const result = await completeTask(supabase, USER_ID, {
      taskId: STANDALONE_TASK_ID,
    });

    expect(result).toEqual({
      success: false,
      error: "Task not found or could not be completed.",
    });
    expect(setJarvisGoalTaskCompletionMock).not.toHaveBeenCalled();
  });

  it("does not loop retries beyond one re-read", async () => {
    const { supabase } = createSupabaseMock({
      initialGoalId: null,
      standaloneUpdateError: true,
      retryGoalId: null,
    });

    const result = await completeTask(supabase, USER_ID, {
      taskId: STANDALONE_TASK_ID,
    });

    expect(result).toEqual({
      success: false,
      error: "Task not found or could not be completed.",
    });
    expect(setJarvisGoalTaskCompletionMock).not.toHaveBeenCalled();
  });

  it("rejects locked future-level goal tasks through Goals RPC", async () => {
    const { supabase } = createSupabaseMock({ initialGoalId: GOAL_ID });

    setJarvisGoalTaskCompletionMock.mockResolvedValue({
      success: false,
      error: "Complete earlier roadmap levels before this task.",
    });

    const result = await completeTask(supabase, USER_ID, {
      taskId: GOAL_TASK_ID,
    });

    expect(result).toEqual({
      success: false,
      error: "Complete earlier roadmap levels before this task.",
    });
  });

  it("rejects archived goal tasks through Goals RPC", async () => {
    const { supabase } = createSupabaseMock({ initialGoalId: GOAL_ID });

    setJarvisGoalTaskCompletionMock.mockResolvedValue({
      success: false,
      error: "Archived goals cannot be updated.",
    });

    const result = await completeTask(supabase, USER_ID, {
      taskId: GOAL_TASK_ID,
    });

    expect(result).toEqual({
      success: false,
      error: "Archived goals cannot be updated.",
    });
  });
});
