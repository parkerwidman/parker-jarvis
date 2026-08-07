import { beforeEach, describe, expect, it, vi } from "vitest";

const { completeTaskMock } = vi.hoisted(() => ({
  completeTaskMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/jarvis/tools/task-tools", () => ({
  completeTask: completeTaskMock,
}));

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { completePriorityTask } from "@/app/command-center/actions";

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("completePriorityTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses authenticated server logic and prevents duplicate submission while loading", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: USER_ID } },
          error: null,
        }),
      },
    } as never);

    completeTaskMock.mockResolvedValue({ success: true, task: { id: TASK_ID } });

    const first = await completePriorityTask(TASK_ID);
    const second = await completePriorityTask(TASK_ID);

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(completeTaskMock).toHaveBeenCalledTimes(2);
    expect(completeTaskMock).toHaveBeenCalledWith(expect.anything(), USER_ID, {
      taskId: TASK_ID,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/tasks");
  });

  it("rejects invalid task ids without calling completeTask", async () => {
    const result = await completePriorityTask("not-a-task");

    expect(result).toEqual({ ok: false, error: "Invalid task." });
    expect(completeTaskMock).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: null,
          error: new Error("no session"),
        }),
      },
    } as never);

    const result = await completePriorityTask(TASK_ID);

    expect(result).toEqual({
      ok: false,
      error: "You must be signed in to complete a task.",
    });
    expect(completeTaskMock).not.toHaveBeenCalled();
  });
});
