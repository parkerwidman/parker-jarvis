"use client";

import { useState } from "react";
import { domainLabel, type GoalView } from "@/lib/jarvis/goals/types";
import { LevelRoadmap } from "./level-roadmap";

type GoalCardProps = {
  goal: GoalView;
  showTodayPriority: boolean;
};

export function GoalCard({ goal, showTodayPriority }: GoalCardProps) {
  const isCompleted = goal.status === "completed";
  const [expanded, setExpanded] = useState(!isCompleted);
  const showPriorityBadge = showTodayPriority && goal.isTodayPriority;

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
          <div className="goals-card-title-row">
            <h2 className="goals-card-title">{goal.title}</h2>
            <span className={`goals-domain-tag goals-domain-tag--${goal.domain}`}>
              {domainLabel(goal.domain)}
            </span>
          </div>
          {showPriorityBadge ? (
            <p className="goals-priority-badge">★ TODAY&apos;S PRIORITY</p>
          ) : null}
          {goal.description && (!isCompleted || expanded) ? (
            <p className="goals-card-description">{goal.description}</p>
          ) : null}
        </div>
        <div className="goals-card-head-meta">
          <span className="goals-card-progress">{goal.progressPercent}%</span>
          {isCompleted ? (
            <button
              type="button"
              className="goals-card-toggle"
              onClick={() => setExpanded((value) => !value)}
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

      {(!isCompleted || expanded) ? (
        <div className="goals-card-body">
          <LevelRoadmap levels={goal.levels} />
        </div>
      ) : null}
    </article>
  );
}
