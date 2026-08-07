export const FOCUS_TIMER_DURATION_MS = 25 * 60 * 1000;
export const FOCUS_TIMER_STORAGE_KEY = "jarvis-command-center-focus-timer";
export const FOCUS_TIMER_VERSION = 1 as const;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRIORITY_KEY_REGEX =
  /^task:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type FocusTimerStatus = "running" | "paused" | "completed";

export type FocusTimerState = {
  version: typeof FOCUS_TIMER_VERSION;
  priorityKey: string;
  priorityTitle: string;
  status: FocusTimerStatus;
  startedAt: number;
  endsAt: number;
  remainingMs?: number;
};

export type FocusTimerPhase = "idle" | "running" | "paused" | "completed";

export type FocusPriority = {
  key: string;
  title: string;
  taskId: string | null;
};

export function buildPriorityKey(taskId: string): string {
  return `task:${taskId}`;
}

export function buildFocusPriorityFromTask(task: {
  id: string;
  title: string;
}): FocusPriority | null {
  const title = task.title.trim();
  if (!title || !UUID_REGEX.test(task.id)) {
    return null;
  }

  return {
    key: buildPriorityKey(task.id),
    title,
    taskId: task.id,
  };
}

export function parsePriorityTaskId(priorityKey: string): string | null {
  const match = /^task:([0-9a-f-]{36})$/i.exec(priorityKey);
  if (!match || !UUID_REGEX.test(match[1])) {
    return null;
  }

  return match[1];
}

export function isEligibleForTaskCompletion(
  focusTask: { id: string; title: string } | null | undefined,
): focusTask is { id: string; title: string } {
  if (!focusTask) {
    return false;
  }

  return UUID_REGEX.test(focusTask.id) && focusTask.title.trim().length > 0;
}

export function formatRemainingMs(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function computeRemainingMs(state: FocusTimerState, now: number): number {
  if (state.status === "paused") {
    return Math.max(0, state.remainingMs ?? 0);
  }

  if (state.status === "completed") {
    return 0;
  }

  return Math.max(0, state.endsAt - now);
}

export function resolveTimerPhase(
  state: FocusTimerState | null,
  now: number,
): FocusTimerPhase {
  if (!state) {
    return "idle";
  }

  if (state.status === "completed") {
    return "completed";
  }

  if (state.status === "paused") {
    return "paused";
  }

  return computeRemainingMs(state, now) <= 0 ? "completed" : "running";
}

export function createRunningTimer(input: {
  priorityKey: string;
  priorityTitle: string;
  now: number;
}): FocusTimerState {
  const priorityTitle = input.priorityTitle.trim();

  return {
    version: FOCUS_TIMER_VERSION,
    priorityKey: input.priorityKey,
    priorityTitle,
    status: "running",
    startedAt: input.now,
    endsAt: input.now + FOCUS_TIMER_DURATION_MS,
  };
}

export function pauseTimer(state: FocusTimerState, now: number): FocusTimerState {
  return {
    ...state,
    status: "paused",
    remainingMs: computeRemainingMs(state, now),
  };
}

export function resumeTimer(state: FocusTimerState, now: number): FocusTimerState {
  const remainingMs = Math.max(0, state.remainingMs ?? 0);

  return {
    ...state,
    status: "running",
    endsAt: now + remainingMs,
    remainingMs: undefined,
  };
}

export function markTimerCompleted(state: FocusTimerState): FocusTimerState {
  return {
    ...state,
    status: "completed",
    remainingMs: 0,
  };
}

export function shouldRetargetTimer(
  activeTimer: FocusTimerState | null,
  nextPriority: FocusPriority | null,
): boolean {
  if (!activeTimer || !nextPriority) {
    return false;
  }

  return activeTimer.priorityKey !== nextPriority.key;
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isValidPriorityTitle(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 200;
}

export function normalizeStoredTimer(
  raw: unknown,
  now: number,
): FocusTimerState | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;

  if (record.version !== FOCUS_TIMER_VERSION) {
    return null;
  }

  if (
    typeof record.priorityKey !== "string" ||
    !PRIORITY_KEY_REGEX.test(record.priorityKey)
  ) {
    return null;
  }

  if (!isValidPriorityTitle(record.priorityTitle)) {
    return null;
  }

  if (
    record.status !== "running" &&
    record.status !== "paused" &&
    record.status !== "completed"
  ) {
    return null;
  }

  if (!isValidTimestamp(record.startedAt) || !isValidTimestamp(record.endsAt)) {
    return null;
  }

  if (record.endsAt <= record.startedAt) {
    return null;
  }

  const base: FocusTimerState = {
    version: FOCUS_TIMER_VERSION,
    priorityKey: record.priorityKey,
    priorityTitle: record.priorityTitle.trim(),
    status: record.status,
    startedAt: record.startedAt,
    endsAt: record.endsAt,
  };

  if (record.status === "paused") {
    if (!isValidTimestamp(record.remainingMs)) {
      return null;
    }

    if (
      record.remainingMs <= 0 ||
      record.remainingMs > FOCUS_TIMER_DURATION_MS
    ) {
      return null;
    }

    return {
      ...base,
      remainingMs: record.remainingMs,
    };
  }

  if (record.status === "completed") {
    return markTimerCompleted(base);
  }

  if (record.endsAt <= now) {
    return markTimerCompleted(base);
  }

  return base;
}

export function parseStoredTimer(
  raw: string | null,
  now: number,
): FocusTimerState | null {
  if (!raw) {
    return null;
  }

  try {
    return normalizeStoredTimer(JSON.parse(raw), now);
  } catch {
    return null;
  }
}

export function serializeTimer(state: FocusTimerState): string {
  return JSON.stringify(state);
}

export function readTimerFromStorage(
  storage: Pick<Storage, "getItem">,
  now: number,
): FocusTimerState | null {
  return parseStoredTimer(storage.getItem(FOCUS_TIMER_STORAGE_KEY), now);
}

export function writeTimerToStorage(
  storage: Pick<Storage, "setItem" | "removeItem">,
  state: FocusTimerState | null,
): void {
  if (!state) {
    storage.removeItem(FOCUS_TIMER_STORAGE_KEY);
    return;
  }

  storage.setItem(FOCUS_TIMER_STORAGE_KEY, serializeTimer(state));
}

export function syncTimerWithClock(
  state: FocusTimerState,
  now: number,
): FocusTimerState | null {
  const phase = resolveTimerPhase(state, now);

  if (phase === "completed" && state.status !== "completed") {
    return markTimerCompleted(state);
  }

  return state;
}
