import Link from "next/link";
import { completeTaskFromDashboard } from "@/app/command-center/actions";
import type { FocusTask } from "@/lib/jarvis/dashboard/build-command-center-view";
import { formatDueDate } from "@/lib/jarvis/dashboard/command-center-utils";

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`cc-priority cc-priority--${priority}`}>{priority}</span>
  );
}

export function FocusNowSection({
  focusTask,
  timeZone,
}: {
  focusTask: FocusTask | null;
  timeZone: string;
}) {
  return (
    <section className="cc-priority-hero" aria-label="#1 Priority">
      <div className="cc-priority-hero-header">
        <h2 className="cc-priority-hero-label">#1 Priority</h2>
        {focusTask ? (
          <form action={completeTaskFromDashboard}>
            <input type="hidden" name="taskId" value={focusTask.id} />
            <button
              type="submit"
              className="cc-priority-hero-complete"
              aria-label={`Complete ${focusTask.title}`}
            >
              Mark complete
            </button>
          </form>
        ) : null}
      </div>

      {!focusTask ? (
        <div className="cc-priority-hero-empty">
          <p>No priority task selected. Add a task or choose your next focus.</p>
          <Link href="/tasks" className="cc-priority-hero-action">
            Go to Tasks
          </Link>
        </div>
      ) : (
        <div className="cc-priority-hero-body">
          <h3 className="cc-priority-hero-title">{focusTask.title}</h3>

          {focusTask.nextAction ? (
            <p className="cc-priority-hero-next">
              <span className="cc-priority-hero-next-label">Next action:</span>
              <span className="cc-priority-hero-next-value">{focusTask.nextAction}</span>
            </p>
          ) : null}

          <div className="cc-priority-hero-meta">
            {focusTask.lifeAreaName ? (
              <span className="cc-priority-hero-area">{focusTask.lifeAreaName}</span>
            ) : null}
            <PriorityBadge priority={focusTask.priority} />
            {focusTask.dueAt ? (
              <span
                className={`cc-priority-hero-due${focusTask.overdue ? " cc-priority-hero-due--overdue" : ""}`}
              >
                Due {formatDueDate(focusTask.dueAt, timeZone)}
                {focusTask.overdue ? " · Overdue" : focusTask.dueToday ? " · Today" : null}
              </span>
            ) : null}
            <span className="cc-priority-hero-reason">{focusTask.selectionReason}</span>
          </div>
        </div>
      )}
    </section>
  );
}
