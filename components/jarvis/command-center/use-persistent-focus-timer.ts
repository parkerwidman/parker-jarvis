"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeRemainingMs,
  createRunningTimer,
  FOCUS_TIMER_STORAGE_KEY,
  markTimerCompleted,
  pauseTimer,
  readTimerFromStorage,
  resolveTimerPhase,
  resumeTimer,
  syncTimerWithClock,
  writeTimerToStorage,
  parsePriorityTaskId,
  type FocusPriority,
  type FocusTimerPhase,
  type FocusTimerState,
} from "@/lib/jarvis/dashboard/focus-timer";

type UsePersistentFocusTimerResult = {
  phase: FocusTimerPhase;
  displayTitle: string | null;
  remainingMs: number;
  remainingLabel: string;
  canStart: boolean;
  activeTaskId: string | null;
  start: () => void;
  pause: () => void;
  resume: () => void;
  end: () => void;
  dismiss: () => void;
  startAnother: () => void;
};

function formatRemainingLabel(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function usePersistentFocusTimer(
  currentPriority: FocusPriority | null,
): UsePersistentFocusTimerResult {
  const [timer, setTimer] = useState<FocusTimerState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const completionHandledRef = useRef(false);

  useEffect(() => {
    const restored = readTimerFromStorage(localStorage, Date.now());
    setTimer(restored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    writeTimerToStorage(localStorage, timer);
  }, [hydrated, timer]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hydrated]);

  useEffect(() => {
    if (!timer || timer.status !== "running") {
      return;
    }

    const synced = syncTimerWithClock(timer, now);
    if (synced?.status === "completed" && !completionHandledRef.current) {
      completionHandledRef.current = true;
      setTimer(synced);
    }
  }, [now, timer]);

  const phase = resolveTimerPhase(timer, now);
  const remainingMs = timer ? computeRemainingMs(timer, now) : 0;
  const canStart = currentPriority !== null;

  const displayTitle =
    timer && phase !== "idle"
      ? timer.priorityTitle
      : currentPriority?.title ?? null;

  const activeTaskId =
    timer && phase !== "idle"
      ? parsePriorityTaskId(timer.priorityKey)
      : (currentPriority?.taskId ?? null);

  const persistTimer = useCallback((next: FocusTimerState | null) => {
    completionHandledRef.current = next?.status === "completed";
    setTimer(next);
  }, []);

  const start = useCallback(() => {
    if (!currentPriority) {
      return;
    }

    const next = createRunningTimer({
      priorityKey: currentPriority.key,
      priorityTitle: currentPriority.title,
      now: Date.now(),
    });
    completionHandledRef.current = false;
    setTimer(next);
    setNow(Date.now());
  }, [currentPriority]);

  const pause = useCallback(() => {
    setTimer((current) => {
      if (!current || current.status !== "running") {
        return current;
      }

      return pauseTimer(current, Date.now());
    });
    setNow(Date.now());
  }, []);

  const resume = useCallback(() => {
    setTimer((current) => {
      if (!current || current.status !== "paused") {
        return current;
      }

      return resumeTimer(current, Date.now());
    });
    setNow(Date.now());
  }, []);

  const end = useCallback(() => {
    persistTimer(null);
    setNow(Date.now());
  }, [persistTimer]);

  const dismiss = useCallback(() => {
    persistTimer(null);
    setNow(Date.now());
  }, [persistTimer]);

  const startAnother = useCallback(() => {
    if (!currentPriority) {
      persistTimer(null);
      return;
    }

    const next = createRunningTimer({
      priorityKey: currentPriority.key,
      priorityTitle: currentPriority.title,
      now: Date.now(),
    });
    completionHandledRef.current = false;
    setTimer(next);
    setNow(Date.now());
  }, [currentPriority, persistTimer]);

  return {
    phase,
    displayTitle,
    remainingMs,
    remainingLabel: formatRemainingLabel(remainingMs),
    canStart,
    activeTaskId,
    start,
    pause,
    resume,
    end,
    dismiss,
    startAnother,
  };
}

export { FOCUS_TIMER_STORAGE_KEY };
