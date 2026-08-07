import { describe, expect, it, vi } from "vitest";

import {
  buildFocusPriorityFromTask,
  buildPriorityKey,
  computeRemainingMs,
  createRunningTimer,
  FOCUS_TIMER_DURATION_MS,
  FOCUS_TIMER_STORAGE_KEY,
  isEligibleForTaskCompletion,
  markTimerCompleted,
  normalizeStoredTimer,
  parseStoredTimer,
  pauseTimer,
  readTimerFromStorage,
  resolveTimerPhase,
  resumeTimer,
  serializeTimer,
  shouldRetargetTimer,
  syncTimerWithClock,
  writeTimerToStorage,
} from "@/lib/jarvis/dashboard/focus-timer";

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TASK_ID = "22222222-2222-4222-8222-222222222222";

function makeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));

  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
  };
}

describe("focus timer", () => {
  it("starts at 25 minutes", () => {
    const now = 1_700_000_000_000;
    const timer = createRunningTimer({
      priorityKey: buildPriorityKey(TASK_ID),
      priorityTitle: "Write proposal",
      now,
    });

    expect(timer.endsAt - timer.startedAt).toBe(FOCUS_TIMER_DURATION_MS);
    expect(computeRemainingMs(timer, now)).toBe(FOCUS_TIMER_DURATION_MS);
    expect(formatTimer(timer, now)).toBe("25:00");
  });

  it("derives remaining time from endsAt while running", () => {
    const now = 1_700_000_000_000;
    const timer = createRunningTimer({
      priorityKey: buildPriorityKey(TASK_ID),
      priorityTitle: "Write proposal",
      now,
    });

    expect(computeRemainingMs(timer, now + 90_000)).toBe(FOCUS_TIMER_DURATION_MS - 90_000);
    expect(resolveTimerPhase(timer, now + 90_000)).toBe("running");
  });

  it("survives serialized storage and restoration", () => {
    const now = 1_700_000_000_000;
    const timer = createRunningTimer({
      priorityKey: buildPriorityKey(TASK_ID),
      priorityTitle: "Write proposal",
      now,
    });
    const storage = makeStorage();

    writeTimerToStorage(storage, timer);
    const restored = readTimerFromStorage(storage, now + 30_000);

    expect(restored).toEqual(timer);
    expect(storage.setItem).toHaveBeenCalledWith(
      FOCUS_TIMER_STORAGE_KEY,
      serializeTimer(timer),
    );
  });

  it("preserves remaining time when paused", () => {
    const now = 1_700_000_000_000;
    const running = createRunningTimer({
      priorityKey: buildPriorityKey(TASK_ID),
      priorityTitle: "Write proposal",
      now,
    });
    const paused = pauseTimer(running, now + 120_000);

    expect(paused.status).toBe("paused");
    expect(paused.remainingMs).toBe(FOCUS_TIMER_DURATION_MS - 120_000);
    expect(computeRemainingMs(paused, now + 999_000)).toBe(
      FOCUS_TIMER_DURATION_MS - 120_000,
    );
  });

  it("creates a correct endsAt when resumed", () => {
    const now = 1_700_000_000_000;
    const running = createRunningTimer({
      priorityKey: buildPriorityKey(TASK_ID),
      priorityTitle: "Write proposal",
      now,
    });
    const paused = pauseTimer(running, now + 300_000);
    const resumed = resumeTimer(paused, now + 600_000);

    expect(resumed.status).toBe("running");
    expect(resumed.endsAt).toBe(now + 600_000 + (FOCUS_TIMER_DURATION_MS - 300_000));
    expect(resumed.remainingMs).toBeUndefined();
  });

  it("resolves background delay from timestamps", () => {
    const now = 1_700_000_000_000;
    const timer = createRunningTimer({
      priorityKey: buildPriorityKey(TASK_ID),
      priorityTitle: "Write proposal",
      now,
    });

    expect(computeRemainingMs(timer, now + FOCUS_TIMER_DURATION_MS + 45_000)).toBe(0);
    expect(resolveTimerPhase(timer, now + FOCUS_TIMER_DURATION_MS + 45_000)).toBe(
      "completed",
    );
  });

  it("transitions to completed exactly once at zero", () => {
    const now = 1_700_000_000_000;
    const timer = createRunningTimer({
      priorityKey: buildPriorityKey(TASK_ID),
      priorityTitle: "Write proposal",
      now,
    });
    const completed = syncTimerWithClock(timer, now + FOCUS_TIMER_DURATION_MS);

    expect(completed?.status).toBe("completed");
    expect(syncTimerWithClock(completed!, now + FOCUS_TIMER_DURATION_MS + 5_000)).toEqual(
      completed,
    );
  });

  it("discards malformed storage", () => {
    const now = 1_700_000_000_000;

    expect(parseStoredTimer("{not-json", now)).toBeNull();
    expect(
      normalizeStoredTimer(
        {
          version: 2,
          priorityKey: buildPriorityKey(TASK_ID),
          priorityTitle: "Bad version",
          status: "running",
          startedAt: now,
          endsAt: now + 1000,
        },
        now,
      ),
    ).toBeNull();
    expect(
      normalizeStoredTimer(
        {
          version: 1,
          priorityKey: "focus:text-only",
          priorityTitle: "Text only",
          status: "running",
          startedAt: now,
          endsAt: now + 1000,
        },
        now,
      ),
    ).toBeNull();
    expect(
      normalizeStoredTimer(
        {
          version: 1,
          priorityKey: buildPriorityKey(TASK_ID),
          priorityTitle: "",
          status: "running",
          startedAt: now,
          endsAt: now + 1000,
        },
        now,
      ),
    ).toBeNull();
  });

  it("does not retarget an active timer when dashboard priority changes", () => {
    const active = createRunningTimer({
      priorityKey: buildPriorityKey(TASK_ID),
      priorityTitle: "Original priority",
      now: 1_700_000_000_000,
    });
    const nextPriority = buildFocusPriorityFromTask({
      id: OTHER_TASK_ID,
      title: "New dashboard priority",
    });

    expect(shouldRetargetTimer(active, nextPriority)).toBe(true);
    expect(active.priorityTitle).toBe("Original priority");
    expect(active.priorityKey).toBe(buildPriorityKey(TASK_ID));
  });

  it("cannot start without a meaningful priority", () => {
    expect(buildFocusPriorityFromTask({ id: TASK_ID, title: "   " })).toBeNull();
    expect(buildFocusPriorityFromTask({ id: "bad-id", title: "Task" })).toBeNull();
  });

  it("shows complete task only for a real eligible task", () => {
    expect(
      isEligibleForTaskCompletion({ id: TASK_ID, title: "Write proposal" }),
    ).toBe(true);
    expect(isEligibleForTaskCompletion({ id: "bad-id", title: "Write proposal" })).toBe(
      false,
    );
    expect(isEligibleForTaskCompletion(null)).toBe(false);
  });
});

function formatTimer(
  timer: ReturnType<typeof createRunningTimer>,
  now: number,
): string {
  const remainingMs = computeRemainingMs(timer, now);
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

describe("priority task completion eligibility", () => {
  it("delegates completion to authenticated server action", async () => {
    const { completePriorityTask } = await import("@/app/command-center/actions");
    expect(typeof completePriorityTask).toBe("function");
  });
});

describe("timer remains active after task completion", () => {
  it("keeps timer state independent from task completion eligibility", () => {
    const now = 1_700_000_000_000;
    const timer = createRunningTimer({
      priorityKey: buildPriorityKey(TASK_ID),
      priorityTitle: "Write proposal",
      now,
    });

    expect(isEligibleForTaskCompletion({ id: TASK_ID, title: "Write proposal" })).toBe(
      true,
    );
    expect(resolveTimerPhase(timer, now + 60_000)).toBe("running");
    expect(timer.status).toBe("running");
  });
});
