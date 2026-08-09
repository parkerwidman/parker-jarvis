import type { GoalLevelView } from "@/lib/jarvis/goals/types";
import { GoalTaskRow } from "./goal-task-row";

type LevelRoadmapProps = {
  levels: GoalLevelView[];
};

function levelStateLabel(state: GoalLevelView["state"]): string {
  switch (state) {
    case "complete":
      return "Complete";
    case "current":
      return "Current";
    default:
      return "Locked";
  }
}

export function LevelRoadmap({ levels }: LevelRoadmapProps) {
  if (levels.length === 0) {
    return <p className="goals-roadmap-empty">No roadmap levels yet.</p>;
  }

  return (
    <ol className="goals-roadmap" aria-label="Goal roadmap">
      {levels.map((level, index) => (
        <li
          key={level.id}
          className={`goals-roadmap-level goals-roadmap-level--${level.state}${
            index === levels.length - 1 ? " goals-roadmap-level--last" : ""
          }`}
        >
          <div className="goals-roadmap-marker" aria-hidden="true">
            <span className="goals-roadmap-dot" />
            {index < levels.length - 1 ? (
              <span className="goals-roadmap-connector" />
            ) : null}
          </div>
          <div className="goals-roadmap-content">
            <div className="goals-roadmap-head">
              <h3 className="goals-roadmap-level-name">{level.name}</h3>
              <span className="goals-roadmap-state">{levelStateLabel(level.state)}</span>
            </div>
            {level.tasks.length > 0 ? (
              <>
                <p className="goals-roadmap-tasks-label">Tasks</p>
                <ul className="goals-task-list">
                  {level.tasks.map((task) => (
                    <GoalTaskRow
                      key={task.id}
                      task={task}
                      levelState={level.state}
                    />
                  ))}
                </ul>
              </>
            ) : (
              <p className="goals-roadmap-level-empty">No tasks in this level.</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
