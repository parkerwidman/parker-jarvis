"use client";

import {
  clearTodayPriorityGoal,
  setTodayPriorityGoal,
} from "@/app/goals/actions";
import { formatGoalTargetDateLabel } from "@/lib/jarvis/goals/goal-dates";
import {
  domainLabel,
  type GoalView,
  type JarvisGoalType,
} from "@/lib/jarvis/goals/types";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { GoalSettingsPanel } from "./goal-settings-panel";
import { LevelRoadmap } from "./level-roadmap";

type GoalDetailPanelProps = {
  goal: GoalView;
  currentGoalType: JarvisGoalType;
  showCurrentPriority: boolean;
};

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" stroke="currentColor" />
      <path d="M1.5 5.5h11M4.5 1.5v2M9.5 1.5v2" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

export function GoalDetailPanel({
  goal,
  currentGoalType,
  showCurrentPriority,
}: GoalDetailPanelProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const [detailExpanded, setDetailExpanded] = useState(true);

  const isCompleted = goal.status === "completed";
  const targetLabel = formatGoalTargetDateLabel(goal.targetDate);
  const canSetPriority = showCurrentPriority && !isCompleted && !goal.isCurrentPriority;
  const canClearPriority = showCurrentPriority && !isCompleted && goal.isCurrentPriority;

  useEffect(() => {
    setIsEditing(false);
    setDetailExpanded(true);
    setPriorityError(null);
  }, [goal.id]);

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
      const result = await clearTodayPriorityGoal(goal.domain, currentGoalType);

      if (!result.ok) {
        setPriorityError(result.error);
        return;
      }

      router.refresh();
    });
  }

  return (
    <section className="gd2-detail-panel" aria-label={`${goal.title} details`}>
      <div className="gd2-detail-header">
        <div className="gd2-detail-header-main">
          {goal.isCurrentPriority && !isCompleted ? (
            <span className="gd2-detail-priority">CURRENT PRIORITY</span>
          ) : null}
          <div className="gd2-detail-title-row">
            <h2 className="gd2-detail-title">{goal.title}</h2>
            <span className={`gd2-detail-domain gd2-detail-domain--${goal.domain}`}>
              {domainLabel(goal.domain)}
            </span>
          </div>
        </div>

        <div className="gd2-detail-header-actions">
          <span className="gd2-detail-progress">{goal.progressPercent}%</span>
          {!isCompleted ? (
            <button
              type="button"
              className="gd2-detail-edit-btn"
              aria-pressed={isEditing}
              onClick={() => setIsEditing((value) => !value)}
            >
              {isEditing ? "Done editing" : "Edit Goal"}
            </button>
          ) : null}
          <button
            type="button"
            className="gd2-detail-collapse-btn"
            aria-expanded={detailExpanded}
            onClick={() => setDetailExpanded((value) => !value)}
          >
            {detailExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {detailExpanded ? (
        <>
          {!isEditing ? (
            <div className="gd2-detail-body">
              <div className="gd2-detail-info">
                <section className="gd2-info-block">
                  <h3 className="gd2-info-label">Goal Overview</h3>
                  <p className="gd2-info-value">
                    {goal.description?.trim() ? goal.description : "No overview added."}
                  </p>
                </section>

                <section className="gd2-info-block">
                  <h3 className="gd2-info-label">Target Date</h3>
                  <p className="gd2-info-value gd2-info-value--with-icon">
                    <CalendarIcon />
                    {targetLabel ?? "No target date"}
                  </p>
                </section>

                <section className="gd2-info-block">
                  <h3 className="gd2-info-label">Domain</h3>
                  <p className="gd2-info-value">{domainLabel(goal.domain)}</p>
                </section>

                <section className="gd2-info-block">
                  <h3 className="gd2-info-label">Notes</h3>
                  <p className="gd2-info-value">
                    {goal.notes?.trim() ? goal.notes : "No notes added."}
                  </p>
                </section>

                {showCurrentPriority && !isCompleted ? (
                  <div className="gd2-priority-actions">
                    {canSetPriority ? (
                      <button
                        type="button"
                        className="gd2-priority-btn"
                        disabled={isPending}
                        onClick={handleSetPriority}
                      >
                        Set as Current Priority
                      </button>
                    ) : null}
                    {canClearPriority ? (
                      <button
                        type="button"
                        className="gd2-priority-btn gd2-priority-btn--ghost"
                        disabled={isPending}
                        onClick={handleClearPriority}
                      >
                        Clear Current Priority
                      </button>
                    ) : null}
                    {priorityError ? (
                      <p className="goals-task-error">{priorityError}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="gd2-detail-roadmap">
                <div className="gd2-roadmap-head">
                  <h3 className="gd2-roadmap-title">Roadmap</h3>
                </div>
                <div className="gd2-roadmap-scroll">
                  <LevelRoadmap
                    goalId={goal.id}
                    levels={goal.levels}
                    goalStatus={goal.status}
                    isEditing={false}
                    variant="timeline"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="gd2-detail-edit">
              <div className="gd2-detail-edit-settings">
                <GoalSettingsPanel
                  goalId={goal.id}
                  title={goal.title}
                  description={goal.description}
                  notes={goal.notes}
                  targetDate={goal.targetDate}
                  domain={goal.domain}
                  currentGoalType={currentGoalType}
                  isEditing={isEditing}
                  embedded
                  prioritySlot={
                    showCurrentPriority && !isCompleted ? (
                      <div className="gd2-priority-actions">
                        {canSetPriority ? (
                          <button
                            type="button"
                            className="gd2-priority-btn"
                            disabled={isPending}
                            onClick={handleSetPriority}
                          >
                            Set as Current Priority
                          </button>
                        ) : null}
                        {canClearPriority ? (
                          <button
                            type="button"
                            className="gd2-priority-btn gd2-priority-btn--ghost"
                            disabled={isPending}
                            onClick={handleClearPriority}
                          >
                            Clear Current Priority
                          </button>
                        ) : null}
                        {priorityError ? (
                          <p className="goals-task-error">{priorityError}</p>
                        ) : null}
                      </div>
                    ) : null
                  }
                />
              </div>

              <div className="gd2-detail-roadmap gd2-detail-roadmap--edit">
                <div className="gd2-roadmap-head">
                  <h3 className="gd2-roadmap-title">Roadmap</h3>
                </div>
                <div className="gd2-roadmap-scroll">
                  <LevelRoadmap
                    goalId={goal.id}
                    levels={goal.levels}
                    goalStatus={goal.status}
                    isEditing={isEditing}
                    variant="timeline"
                  />
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
