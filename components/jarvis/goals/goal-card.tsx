"use client";

import {
  clearTodayPriorityGoal,
  setTodayPriorityGoal,
} from "@/app/goals/actions";
import {
  domainLabel,
  type GoalView,
} from "@/lib/jarvis/goals/types";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LevelRoadmap } from "./level-roadmap";

type GoalCardProps = {
  goal: GoalView;
  showTodayPriority: boolean;
};

export function GoalCard({ goal, showTodayPriority }: GoalCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const isCompleted = goal.status === "completed";
  const [expanded, setExpanded] = useState(!isCompleted);
  const [isEditing, setIsEditing] = useState(false);
  const showGoalBody = !isCompleted || expanded;
  const showEditToggle = showGoalBody;
  const showPriorityBadge = showTodayPriority && goal.isTodayPriority;
  const showHeaderSurface = !isCompleted || expanded;
  const canSetPriority = showTodayPriority && !isCompleted && !goal.isTodayPriority;
  const canClearPriority = showTodayPriority && !isCompleted && goal.isTodayPriority;

  function handleSetPriority() {
    setPriorityError(null);

    startTransition(async () => {
      const result = await setTodayPriorityGoal(goal.id);

      if (!result.ok) {
        setPriorityError(result.error);
        return;
      }

      router.refresh();
    });
  }

  function handleClearPriority() {
    setPriorityError(null);

    startTransition(async () => {
      const result = await clearTodayPriorityGoal();

      if (!result.ok) {
        setPriorityError(result.error);
        return;
      }

      router.refresh();
    });
  }

  return (
    <article
      className={`goals-card goals-card--${goal.domain}${
        isCompleted ? " goals-card--completed" : ""
      }${showPriorityBadge ? " goals-card--priority" : ""}${
        expanded ? " goals-card--expanded" : " goals-card--collapsed"
      }`}
    >
      <div className="goals-card-head">
        <div className="goals-card-head-main">
          <div
            className={`goals-card-header-surface${
              showHeaderSurface
                ? ` goals-card-header-surface--tinted goals-card-header-surface--${goal.domain}`
                : " goals-card-header-surface--plain"
            }`}
          >
            <div className="goals-card-title-block">
              <p className="goals-card-eyebrow">Goal</p>
              <div className="goals-card-title-row">
                <h2 className="goals-card-title">{goal.title}</h2>
                <span className={`goals-domain-tag goals-domain-tag--${goal.domain}`}>
                  {domainLabel(goal.domain)}
                </span>
              </div>
            </div>
            {showPriorityBadge ? (
              <p className="goals-priority-badge">★ TODAY&apos;S PRIORITY</p>
            ) : null}
            {goal.description && (!isCompleted || expanded) ? (
              <p className="goals-card-description">{goal.description}</p>
            ) : null}
          </div>
        </div>
        <div className="goals-card-head-meta">
          <span className="goals-card-progress">{goal.progressPercent}%</span>
          {isCompleted ? (
            <button
              type="button"
              className="goals-card-toggle"
              onClick={() => {
                setExpanded((value) => {
                  if (value) {
                    setIsEditing(false);
                  }
                  return !value;
                });
              }}
              aria-expanded={expanded}
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="goals-progress-track" aria-hidden="true">
        <div
          className="goals-progress-fill"
          style={{ width: `${goal.progressPercent}%` }}
        />
      </div>

      {canSetPriority || canClearPriority ? (
        <div className="goals-card-priority-actions">
          {canSetPriority ? (
            <button
              type="button"
              className="goals-task-action"
              disabled={isPending}
              onClick={handleSetPriority}
            >
              Set as Today&apos;s Priority
            </button>
          ) : null}
          {canClearPriority ? (
            <button
              type="button"
              className="goals-task-action"
              disabled={isPending}
              onClick={handleClearPriority}
            >
              Clear Priority
            </button>
          ) : null}
        </div>
      ) : null}

      {priorityError ? <p className="goals-task-error">{priorityError}</p> : null}

      {showGoalBody ? (
        <div className="goals-card-body">
          <LevelRoadmap
            goalId={goal.id}
            levels={goal.levels}
            goalStatus={goal.status}
            isEditing={isEditing}
          />
        </div>
      ) : null}

      {showEditToggle ? (
        <div className="goals-card-footer">
          <button
            type="button"
            className="goals-card-edit-toggle"
            aria-pressed={isEditing}
            onClick={() => setIsEditing((value) => !value)}
          >
            {isEditing ? "Done editing" : "Edit goal"}
          </button>
        </div>
      ) : null}
    </article>
  );
}
