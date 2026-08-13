"use client";

import { formatGoalTargetDateLabel } from "@/lib/jarvis/goals/goal-dates";
import { domainLabel, type GoalView } from "@/lib/jarvis/goals/types";

type GoalCompactCardProps = {
  goal: GoalView;
  isSelected: boolean;
  onSelect: () => void;
};

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GoalCompactCard({ goal, isSelected, onSelect }: GoalCompactCardProps) {
  const isCompleted = goal.status === "completed";
  const targetLabel = formatGoalTargetDateLabel(goal.targetDate);

  return (
    <button
      type="button"
      className={`gd2-goal-card gd2-goal-card--${goal.domain}${
        goal.isCurrentPriority && !isCompleted ? " gd2-goal-card--priority" : ""
      }${isCompleted ? " gd2-goal-card--completed" : ""}${
        isSelected ? " gd2-goal-card--selected" : ""
      }`}
      aria-pressed={isSelected}
      onClick={onSelect}
    >
      {goal.isCurrentPriority && !isCompleted ? (
        <span className="gd2-goal-card-priority">CURRENT PRIORITY</span>
      ) : null}

      <div className="gd2-goal-card-head">
        <h3 className="gd2-goal-card-title">{goal.title}</h3>
        <span className={`gd2-goal-card-domain gd2-goal-card-domain--${goal.domain}`}>
          {domainLabel(goal.domain)}
        </span>
      </div>

      <div className="gd2-goal-card-progress-row">
        <div className="gd2-goal-card-progress-track" aria-hidden="true">
          <div
            className="gd2-goal-card-progress-fill"
            style={{ width: `${goal.progressPercent}%` }}
          />
        </div>
        <span className="gd2-goal-card-progress-value">{goal.progressPercent}%</span>
      </div>

      {targetLabel ? (
        <p className="gd2-goal-card-target">Target {targetLabel}</p>
      ) : null}

      <span className="gd2-goal-card-chevron" aria-hidden="true">
        <ChevronIcon />
      </span>
    </button>
  );
}
