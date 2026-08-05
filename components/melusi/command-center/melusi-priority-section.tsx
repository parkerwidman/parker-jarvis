import Link from "next/link";
import { completeMelusiTaskFromDashboard } from "@/app/melusi/actions";
import { CommandCenterPanel } from "@/components/jarvis/command-center/command-center-panel";
import type {
  MelusiBusinessPriority,
  MelusiBusinessTask,
  MelusiTaskGroups,
} from "@/lib/jarvis/melusi/build-melusi-command-center-view";
import { formatDueDate } from "@/lib/jarvis/dashboard/command-center-utils";

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`cc-priority cc-priority--${priority}`}>{priority}</span>
  );
}

function TaskItem({
  task,
  timeZone,
}: {
  task: MelusiBusinessTask;
  timeZone: string;
}) {
  return (
    <li className={`cc-dash-task melusi-dash-task${task.overdue ? " cc-dash-task--overdue" : ""}`}>
      <form action={completeMelusiTaskFromDashboard} className="cc-dash-task-form">
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
          {task.projectName ? (
            <span className="cc-dash-task-area">{task.projectName}</span>
          ) : null}
          <PriorityBadge priority={task.priority} />
          {task.dueAt ? (
            <span
              className={`cc-dash-task-due${task.overdue ? " cc-dash-task-due--overdue" : ""}`}
            >
              Due {formatDueDate(task.dueAt, timeZone)}
              {task.overdue ? " · Overdue" : task.dueToday ? " · Today" : null}
            </span>
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
  tasks: MelusiBusinessTask[];
  timeZone: string;
}) {
  if (tasks.length === 0) {
    return null;
  }

  return (
    <div className="cc-dash-task-group melusi-dash-task-group">
      <h3 className="cc-dash-task-group-label">{label}</h3>
      <ul className="cc-dash-task-list">
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} timeZone={timeZone} />
        ))}
      </ul>
    </div>
  );
}

export function MelusiCommandCenterHeader({
  headerStatus,
  businessContextLine,
}: {
  headerStatus: string;
  businessContextLine: string;
}) {
  return (
    <header className="melusi-dash-header">
      <div className="melusi-dash-header-main">
        <h1 className="melusi-dash-title">
          Melusi <span>Command Center</span>
        </h1>
        <p className="melusi-dash-descriptor">
          AI education business operating dashboard
        </p>
        <p className="melusi-dash-status">{headerStatus}</p>
        <p className="melusi-dash-context">{businessContextLine}</p>
      </div>
    </header>
  );
}

export function MelusiBusinessPrioritySection({
  priority,
  timeZone,
}: {
  priority: MelusiBusinessPriority;
  timeZone: string;
}) {
  return (
    <section
      className="melusi-priority-hero"
      aria-label="#1 Business Priority"
    >
      <div className="melusi-priority-top">
        <h2 className="melusi-priority-label">#1 Business Priority</h2>
        {priority?.kind === "task" ? (
          <form action={completeMelusiTaskFromDashboard}>
            <input type="hidden" name="taskId" value={priority.id} />
            <button
              type="submit"
              className="melusi-priority-complete"
              aria-label={`Complete ${priority.title}`}
            >
              Mark complete
            </button>
          </form>
        ) : null}
      </div>

      {!priority ? (
        <p className="melusi-priority-empty">
          No business priority is selected. Add or prioritize a Melusi task.
        </p>
      ) : priority.kind === "project-planning" ? (
        <div className="melusi-priority-content">
          <h3 className="melusi-priority-title">{priority.projectName}</h3>
          <p className="melusi-priority-project">Planning issue · no next action</p>
          <p className="melusi-priority-next">
            <span>Next action:</span> {priority.nextAction}
          </p>
          <p className="melusi-priority-reason">{priority.selectionReason}</p>
        </div>
      ) : (
        <div className="melusi-priority-content">
          <h3 className="melusi-priority-title">{priority.title}</h3>
          {priority.projectName ? (
            <p className="melusi-priority-project">{priority.projectName}</p>
          ) : null}
          <p className="melusi-priority-next">
            <span>Next action:</span> {priority.nextAction}
          </p>
          <div className="melusi-priority-meta">
            <PriorityBadge priority={priority.priority} />
            {priority.dueAt ? (
              <span
                className={`melusi-priority-due${priority.overdue ? " melusi-priority-due--overdue" : ""}`}
              >
                Due {formatDueDate(priority.dueAt, timeZone)}
                {priority.overdue
                  ? " · Overdue"
                  : priority.dueToday
                    ? " · Today"
                    : null}
              </span>
            ) : null}
            <span className="melusi-priority-reason">{priority.selectionReason}</span>
          </div>
        </div>
      )}
    </section>
  );
}

export function MelusiTasksSection({
  taskGroups,
  timeZone,
}: {
  taskGroups: MelusiTaskGroups;
  timeZone: string;
}) {
  const visibleCount = taskGroups.next.length + taskGroups.later.length;

  return (
    <CommandCenterPanel
      title="Today's Melusi Tasks"
      href="/tasks"
      hrefLabel="All tasks"
      className="melusi-tasks-panel"
    >
      {visibleCount === 0 ? (
        <p className="cc-empty cc-empty--compact">
          No active Melusi tasks. Create the next action for an active project.
        </p>
      ) : (
        <>
          <TaskGroup label="Next" tasks={taskGroups.next} timeZone={timeZone} />
          <TaskGroup label="Later" tasks={taskGroups.later} timeZone={timeZone} />

          {taskGroups.additionalOverdueCount > 0 ? (
            <p className="cc-dash-overdue-summary">
              {taskGroups.additionalOverdueCount} additional overdue task
              {taskGroups.additionalOverdueCount === 1 ? "" : "s"}.{" "}
              <Link href="/tasks">Review tasks</Link>
            </p>
          ) : null}
        </>
      )}
    </CommandCenterPanel>
  );
}
