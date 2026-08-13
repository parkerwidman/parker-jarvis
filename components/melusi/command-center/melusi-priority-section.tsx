import Link from "next/link";
import { completeMelusiTaskFromDashboard } from "@/app/melusi/actions";
import { MelusiHeroOrb } from "@/components/melusi/command-center/melusi-hero-orb";
import {
  MelusiTasksEmptyVisual,
  MelusiTasksIcon,
} from "@/components/melusi/melusi-icons";
import { MelusiPanel } from "@/components/melusi/command-center/melusi-panel";
import type {
  MelusiBusinessPriority,
  MelusiBusinessTask,
  MelusiTaskGroups,
} from "@/lib/jarvis/melusi/build-melusi-command-center-view";
import { formatDueDate } from "@/lib/jarvis/dashboard/command-center-utils";

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`melusi-pill melusi-pill--priority melusi-pill--${priority}`}>
      {priority}
    </span>
  );
}

function ReasonBadge({ reason }: { reason: string }) {
  return <span className="melusi-pill melusi-pill--reason">{reason}</span>;
}

function TaskItem({
  task,
  timeZone,
}: {
  task: MelusiBusinessTask;
  timeZone: string;
}) {
  return (
    <li
      className={`melusi-dash-task${task.overdue ? " melusi-dash-task--overdue" : ""}`}
    >
      <form action={completeMelusiTaskFromDashboard} className="melusi-dash-task-form">
        <input type="hidden" name="taskId" value={task.id} />
        <button
          type="submit"
          className="melusi-dash-task-check"
          aria-label={`Complete ${task.title}`}
        />
      </form>
      <div className="melusi-dash-task-body">
        <span className="melusi-dash-task-title">{task.title}</span>
        <div className="melusi-dash-task-details">
          {task.projectName ? (
            <span className="melusi-dash-task-area">{task.projectName}</span>
          ) : null}
          <PriorityBadge priority={task.priority} />
          {task.dueAt ? (
            <span
              className={`melusi-dash-task-due${task.overdue ? " melusi-dash-task-due--overdue" : ""}`}
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
    <div className="melusi-dash-task-group">
      <h3 className="melusi-dash-task-group-label">{label}</h3>
      <ul className="melusi-dash-task-list">
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} timeZone={timeZone} />
        ))}
      </ul>
    </div>
  );
}

function buildTopPriorityLine(priority: MelusiBusinessPriority): string {
  if (!priority) {
    return "No urgent business issues right now.";
  }

  if (priority.kind === "project-planning") {
    return `Top priority: Assign next action for ${priority.projectName}`;
  }

  if (priority.overdue) {
    return `Top priority: ${priority.title} (overdue)`;
  }

  return `Top priority: ${priority.title}`;
}

export function MelusiCommandCenterHeader({
  businessPriority,
  businessContextLine,
}: {
  businessPriority: MelusiBusinessPriority;
  businessContextLine: string;
}) {
  return (
    <header className="melusi-dash-header">
      <div className="melusi-dash-header-title-row">
        <h1 className="melusi-dash-title">
          Melusi <span>Command Center</span>
        </h1>
        <span className="melusi-dash-header-signal" aria-hidden="true">
          <span className="melusi-dash-header-signal-line" />
        </span>
      </div>
      <p className="melusi-dash-descriptor">
        AI education business operating dashboard
      </p>
      <p className="melusi-dash-status">{buildTopPriorityLine(businessPriority)}</p>
      <p className="melusi-dash-context">{businessContextLine}</p>
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
    <section className="melusi-priority-hero melusi-glass-surface melusi-glass-surface--hero" aria-label="#1 Business Priority">
      <MelusiHeroOrb />

      <div className="melusi-priority-main">
        <p className="melusi-priority-label">#1 Business Priority</p>

        {!priority ? (
          <p className="melusi-priority-empty">
            No business priority is selected. Add or prioritize a Melusi task.
          </p>
        ) : priority.kind === "project-planning" ? (
          <div className="melusi-priority-content">
            <h2 className="melusi-priority-title">{priority.projectName}</h2>
            <p className="melusi-priority-next">
              <span>Next action:</span> {priority.nextAction}
            </p>
            <div className="melusi-priority-badges">
              <ReasonBadge reason={priority.selectionReason} />
            </div>
          </div>
        ) : (
          <div className="melusi-priority-content">
            <h2 className="melusi-priority-title">{priority.title}</h2>
            {priority.projectName ? (
              <p className="melusi-priority-project">{priority.projectName}</p>
            ) : null}
            <p className="melusi-priority-next">
              <span>Next action:</span> {priority.nextAction}
            </p>
            <div className="melusi-priority-badges">
              <PriorityBadge priority={priority.priority} />
              <ReasonBadge reason={priority.selectionReason} />
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
            </div>
          </div>
        )}
      </div>

      <div className="melusi-priority-actions">
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
    <MelusiPanel
      title="Today's Melusi Tasks"
      icon={<MelusiTasksIcon />}
      href="/tasks"
      hrefLabel="All tasks"
      className="melusi-tasks-panel"
    >
      {visibleCount === 0 ? (
        <div className="melusi-empty-state melusi-empty-state--tasks">
          <span className="melusi-empty-state-visual" aria-hidden="true">
            <MelusiTasksEmptyVisual />
          </span>
          <p className="melusi-empty-state-title">No active Melusi tasks.</p>
          <p className="melusi-empty-state-copy">
            Create the next action for an active project.
          </p>
        </div>
      ) : (
        <>
          <TaskGroup label="Next" tasks={taskGroups.next} timeZone={timeZone} />
          <TaskGroup label="Later" tasks={taskGroups.later} timeZone={timeZone} />

          {taskGroups.additionalOverdueCount > 0 ? (
            <p className="melusi-dash-overdue-summary">
              {taskGroups.additionalOverdueCount} additional overdue task
              {taskGroups.additionalOverdueCount === 1 ? "" : "s"}.{" "}
              <Link href="/tasks">Review tasks</Link>
            </p>
          ) : null}
        </>
      )}
    </MelusiPanel>
  );
}
