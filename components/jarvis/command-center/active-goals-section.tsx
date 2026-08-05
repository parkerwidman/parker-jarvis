import type { DashboardGoal } from "@/lib/jarvis/dashboard/build-command-center-view";
import { CommandCenterPanel } from "./command-center-panel";

export function ActiveGoalsSection({ goals }: { goals: DashboardGoal[] }) {
  return (
    <CommandCenterPanel title="Active Goals" href="/assistant" hrefLabel="Ask Jarvis">
      {goals.length === 0 ? (
        <p className="cc-empty">
          No active goals yet. Tell Jarvis about your goals in the assistant.
        </p>
      ) : (
        <ul className="cc-dash-goals">
          {goals.map((goal) => (
            <li key={goal.id} className="cc-dash-goal">
              <div className="cc-dash-goal-header">
                <span className="cc-dash-goal-title">{goal.title}</span>
                {goal.lifeAreaName ? (
                  <span className="cc-dash-goal-area">{goal.lifeAreaName}</span>
                ) : null}
              </div>
              <p className="cc-dash-goal-progress">{goal.progressLabel}</p>
              <p className="cc-dash-goal-next">
                <span className="cc-dash-goal-next-label">Next action:</span>
                <span className="cc-dash-goal-next-value">
                  {goal.nextAction ?? "No next action assigned"}
                </span>
              </p>
              {goal.targetDateLabel ? (
                <p className="cc-dash-goal-target">Target {goal.targetDateLabel}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </CommandCenterPanel>
  );
}
