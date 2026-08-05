import Link from "next/link";
import { completeTaskFromDashboard } from "@/app/command-center/actions";
import type { CommandCenterTask } from "@/lib/jarvis/dashboard/load-command-center";
import type { TaskGroups } from "@/lib/jarvis/dashboard/build-command-center-view";
import { formatDueDate } from "@/lib/jarvis/dashboard/command-center-utils";
import { CommandCenterPanel } from "./command-center-panel";

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`cc-priority cc-priority--${priority}`}>{priority}</span>
  );
}

function TaskItem({
  task,
  timeZone,
}: {
  task: CommandCenterTask;
  timeZone: string;
}) {
  return (
    <li className={`cc-dash-task${task.overdue ? " cc-dash-task--overdue" : ""}`}>
      <form action={completeTaskFromDashboard} className="cc-dash-task-form">
        <input type="hidden" name="taskId" value={task.id} />
        <button
          type="submit"
          className="cc-dash-task-check"
          aria-label={`Complete ${task.title}`}
        />
      </form>
      <div className="cc-dash-task-body">
        <span className="cc-dash-task-title">{task.title}</span>
        <div className="cc-dash-task-details">
          <PriorityBadge priority={task.priority} />
          {task.dueAt ? (
            <span
              className={`cc-dash-task-due${task.overdue ? " cc-dash-task-due--overdue" : ""}`}
            >
              Due {formatDueDate(task.dueAt, timeZone)}
              {task.overdue ? " · Overdue" : task.dueToday ? " · Today" : null}
            </span>
          ) : (
            <span className="cc-dash-task-due">No due date</span>
          )}
          {task.lifeAreaName ? (
            <span className="cc-dash-task-area">{task.lifeAreaName}</span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function TaskGroup({
  label,
  tasks,
  timeZone,
}: {
  label: string;
  tasks: CommandCenterTask[];
  timeZone: string;
}) {
  if (tasks.length === 0) {
    return null;
  }

  return (
    <div className="cc-dash-task-group">
      <h3 className="cc-dash-task-group-label">{label}</h3>
      <ul className="cc-dash-task-list">
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} timeZone={timeZone} />
        ))}
      </ul>
    </div>
  );
}

export function TodaysTasksSection({
  taskGroups,
  timeZone,
}: {
  taskGroups: TaskGroups;
  timeZone: string;
}) {
  const visibleCount = taskGroups.next.length + taskGroups.later.length;

  return (
    <CommandCenterPanel title="Today's Tasks" href="/tasks" hrefLabel="View all tasks">
      {visibleCount === 0 && taskGroups.completedTodayCount === 0 ? (
        <p className="cc-empty">No open tasks for today. Add one from the Tasks page.</p>
      ) : (
        <>
          {taskGroups.completedTodayCount > 0 ? (
            <p className="cc-dash-progress">
              <strong>{taskGroups.completedTodayCount}</strong> completed today
              {taskGroups.dueTodayTotal > 0 ? (
                <>
                  {" · "}
                  <strong>{taskGroups.dueTodayTotal}</strong> due today
                </>
              ) : null}
            </p>
          ) : null}

          <TaskGroup label="Next" tasks={taskGroups.next} timeZone={timeZone} />
          <TaskGroup label="Later" tasks={taskGroups.later} timeZone={timeZone} />

          {taskGroups.additionalOverdueCount > 0 ? (
            <p className="cc-dash-overdue-summary">
              {taskGroups.additionalOverdueCount} additional overdue task
              {taskGroups.additionalOverdueCount === 1 ? "" : "s"} need review.{" "}
              <Link href="/tasks">Review tasks</Link>
            </p>
          ) : null}

          {visibleCount === 0 && taskGroups.completedTodayCount > 0 ? (
            <p className="cc-empty">All visible tasks completed for now.</p>
          ) : null}
        </>
      )}
    </CommandCenterPanel>
  );
}
