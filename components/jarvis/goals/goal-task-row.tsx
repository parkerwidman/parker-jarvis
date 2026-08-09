import type { GoalTaskView } from "@/lib/jarvis/goals/types";

type GoalTaskRowProps = {
  task: GoalTaskView;
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

export function GoalTaskRow({ task }: GoalTaskRowProps) {
  return (
    <li
      className={`goals-task-row${
        task.isDone ? " goals-task-row--done" : ""
      }${task.isActionable ? " goals-task-row--actionable" : ""}${
        task.isBlocked ? " goals-task-row--blocked" : ""
      }`}
    >
      <span
        className={`goals-task-check${
          task.isDone ? " goals-task-check--done" : ""
        }${task.isActionable ? " goals-task-check--current" : ""}`}
        aria-hidden="true"
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
        {task.isBlocked && task.blockedReason ? (
          <p className="goals-task-blocked-reason">{task.blockedReason}</p>
        ) : null}
        {task.notes ? <p className="goals-task-notes-text">{task.notes}</p> : null}
      </div>
    </li>
  );
}
