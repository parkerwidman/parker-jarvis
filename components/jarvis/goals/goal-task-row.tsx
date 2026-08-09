"use client";

import { setGoalTaskCompletion } from "@/app/goals/actions";
import type { GoalTaskView, LevelState } from "@/lib/jarvis/goals/types";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type GoalTaskRowProps = {
  task: GoalTaskView;
  levelState: LevelState;
};

function statusLabel(status: GoalTaskView["status"]): string {
  switch (status) {
    case "done":
      return "Done";
    case "in_progress":
      return "In progress";
    default:
      return "To do";
  }
}

export function GoalTaskRow({ task, levelState }: GoalTaskRowProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canComplete = levelState === "current" && !task.isDone;
  const canReopen = task.isDone;
  const isInteractive = (canComplete || canReopen) && !isPending;

  async function handleToggle() {
    if (!isInteractive) {
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await setGoalTaskCompletion(task.id, !task.isDone);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.refresh();
    });
  }

  return (
    <li
      className={`goals-task-row${
        task.isDone ? " goals-task-row--done" : ""
      }${task.isActionable ? " goals-task-row--actionable" : ""}${
        task.isBlocked ? " goals-task-row--blocked" : ""
      }`}
    >
      <button
        type="button"
        className={`goals-task-check${
          task.isDone ? " goals-task-check--done" : ""
        }${task.isActionable ? " goals-task-check--current" : ""}${
          isInteractive ? " goals-task-check--interactive" : ""
        }`}
        aria-label={
          task.isDone
            ? `Reopen ${task.title}`
            : canComplete
              ? `Complete ${task.title}`
              : `${task.title} locked until earlier levels finish`
        }
        aria-pressed={task.isDone}
        disabled={!isInteractive}
        onClick={handleToggle}
      />
      <div className="goals-task-body">
        <div className="goals-task-title-row">
          <span className="goals-task-title">{task.title}</span>
          {task.isBlocked ? (
            <span className="goals-task-badge goals-task-badge--blocked">Blocked</span>
          ) : null}
        </div>
        <div className="goals-task-meta">
          <span className="goals-task-status">{statusLabel(task.status)}</span>
          {task.notes ? (
            <span className="goals-task-notes" title={task.notes}>
              Notes
            </span>
          ) : null}
        </div>
        {error ? <p className="goals-task-error">{error}</p> : null}
        {task.isBlocked && task.blockedReason ? (
          <p className="goals-task-blocked-reason">{task.blockedReason}</p>
        ) : null}
        {task.notes ? <p className="goals-task-notes-text">{task.notes}</p> : null}
      </div>
    </li>
  );
}
