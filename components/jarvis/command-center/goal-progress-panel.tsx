"use client";

import { useCommandCenterMode } from "./command-center-mode-provider";
import { itemMatchesMode } from "@/lib/jarvis/dashboard/command-center-mode";
import type { CommandCenterGoalProgress } from "@/lib/jarvis/dashboard/load-command-center";

type GoalProgressPanelProps = {
  goals: CommandCenterGoalProgress[];
};

export function GoalProgressPanel({ goals }: GoalProgressPanelProps) {
  const { mode } = useCommandCenterMode();

  const filtered = goals.filter((goal) =>
    itemMatchesMode(goal.lifeAreaName, mode),
  );

  return (
    <section aria-label="Goal progress">
      <div className="cc2-goals-title">Goal progress</div>
      <div className="cc2-goals-panel">
        {filtered.length === 0 ? (
          <p className="cc2-goals-empty">
            No active {mode === "melusi" ? "Melusi" : "personal"} goals yet.
          </p>
        ) : (
          filtered.map((goal) => (
            <div key={goal.id} className="cc2-goal-bar-row">
              <div className="cc2-goal-bar-top">
                <b>{goal.title}</b>
                <span>{goal.progress > 0 ? `${goal.progress}%` : goal.progressLabel}</span>
              </div>
              {goal.progress > 0 ? (
                <div className="cc2-goal-bar-track">
                  <div
                    className="cc2-goal-bar-fill"
                    style={{ width: `${Math.min(goal.progress, 100)}%` }}
                    role="progressbar"
                    aria-valuenow={goal.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${goal.title} progress`}
                  />
                </div>
              ) : (
                <div className="cc2-goal-bar-track cc2-goal-bar-track--empty">
                  <span className="cc2-goal-status">{goal.progressLabel}</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
