"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completePriorityTask } from "@/app/command-center/actions";
import type { FocusTask } from "@/lib/jarvis/dashboard/build-command-center-view";
import { usePersistentFocusTimer } from "./use-persistent-focus-timer";

type PriorityFocusControlsProps = {
  focusTask: FocusTask | null;
  timer: ReturnType<typeof usePersistentFocusTimer>;
};

type CompleteState = "idle" | "loading" | "success" | "error";

const TASK_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isEligibleTaskId(taskId: string | null): taskId is string {
  return typeof taskId === "string" && TASK_ID_REGEX.test(taskId);
}

export function PriorityFocusControls({
  focusTask,
  timer,
}: PriorityFocusControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [completeState, setCompleteState] = useState<CompleteState>("idle");
  const [completeError, setCompleteError] = useState<string | null>(null);

  const completableTaskId =
    timer.phase === "idle" ? (focusTask?.id ?? null) : timer.activeTaskId;
  const completableTitle =
    timer.phase === "idle"
      ? (focusTask?.title ?? null)
      : (timer.displayTitle ?? focusTask?.title ?? null);

  const canComplete =
    isEligibleTaskId(completableTaskId) &&
    completeState !== "success" &&
    !isPending;

  const handleComplete = useCallback(() => {
    if (!completableTaskId || !canComplete) {
      return;
    }

    setCompleteState("loading");
    setCompleteError(null);

    startTransition(async () => {
      const result = await completePriorityTask(completableTaskId);

      if (result.ok) {
        setCompleteState("success");
        router.refresh();
        return;
      }

      setCompleteState("error");
      setCompleteError(result.error);
    });
  }, [canComplete, completableTaskId, router, startTransition]);

  const showCompleteButton =
    isEligibleTaskId(completableTaskId) &&
    completableTitle &&
    completeState !== "success";

  return (
    <div className="cc2-priority-controls">
      {timer.phase === "idle" ? (
        <>
          {!timer.canStart ? (
            <p className="cc2-priority-hint">
              Choose a priority to start a focus block
            </p>
          ) : null}
          <div className="cc2-priority-actions">
            <button
              type="button"
              className="cc2-btn cc2-btn--primary"
              onClick={timer.start}
              disabled={!timer.canStart}
              aria-label="Start 25-minute focus block"
            >
              Start 25-minute focus
            </button>
            {showCompleteButton ? (
              <CompleteTaskButton
                title={completableTitle}
                state={completeState}
                error={completeError}
                disabled={!canComplete}
                onComplete={handleComplete}
              />
            ) : null}
            {completeState === "success" ? (
              <span className="cc2-priority-complete-msg" role="status">
                Task completed
              </span>
            ) : null}
          </div>
        </>
      ) : null}

      {timer.phase === "running" || timer.phase === "paused" ? (
        <div className="cc2-priority-actions cc2-priority-actions--active">
          <div
            className="cc2-focus-countdown"
            role="timer"
            aria-live="polite"
            aria-label={`Focus time remaining ${timer.remainingLabel}`}
          >
            {timer.remainingLabel}
          </div>
          {timer.phase === "running" ? (
            <button
              type="button"
              className="cc2-btn"
              onClick={timer.pause}
              aria-label="Pause focus timer"
            >
              Pause
            </button>
          ) : (
            <button
              type="button"
              className="cc2-btn cc2-btn--primary"
              onClick={timer.resume}
              aria-label="Resume focus timer"
            >
              Resume
            </button>
          )}
          <button
            type="button"
            className="cc2-btn"
            onClick={timer.end}
            aria-label="End focus block"
          >
            End focus
          </button>
          {showCompleteButton ? (
            <CompleteTaskButton
              title={completableTitle}
              state={completeState}
              error={completeError}
              disabled={!canComplete}
              onComplete={handleComplete}
            />
          ) : null}
        </div>
      ) : null}

      {timer.phase === "completed" ? (
        <div className="cc2-priority-actions cc2-priority-actions--complete">
          <p className="cc2-focus-complete-msg" role="status">
            Focus block complete
          </p>
          <button
            type="button"
            className="cc2-btn cc2-btn--primary"
            onClick={timer.startAnother}
            disabled={!timer.canStart}
            aria-label="Start another 25-minute focus block"
          >
            Start another 25-minute focus
          </button>
          <button
            type="button"
            className="cc2-btn"
            onClick={timer.dismiss}
            aria-label="Dismiss focus completion message"
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CompleteTaskButton({
  title,
  state,
  error,
  disabled,
  onComplete,
}: {
  title: string;
  state: CompleteState;
  error: string | null;
  disabled: boolean;
  onComplete: () => void;
}) {
  const label =
    state === "loading" ? "Completing…" : state === "error" ? "Try again" : "Complete task";

  return (
    <div className="cc2-priority-complete-wrap">
      <button
        type="button"
        className="cc2-btn"
        onClick={onComplete}
        disabled={disabled || state === "loading"}
        aria-label={`Complete task ${title}`}
        aria-busy={state === "loading"}
      >
        {label}
      </button>
      {state === "error" && error ? (
        <span className="cc2-priority-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
