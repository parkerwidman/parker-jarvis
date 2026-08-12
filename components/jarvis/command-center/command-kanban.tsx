"use client";

import { completeTaskFromDashboard } from "@/app/command-center/actions";
import { useCommandCenterMode } from "./command-center-mode-provider";
import {
  itemMatchesMode,
  modeTagLabel,
} from "@/lib/jarvis/dashboard/command-center-mode";
import type { CommandCenterKanbanTask } from "@/lib/jarvis/dashboard/load-command-center";

type CommandKanbanProps = {
  tasks: CommandCenterKanbanTask[];
};

const COLUMNS = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
] as const;

function priorityLabel(priority: string): string | null {
  switch (priority) {
    case "high":
      return "High priority";
    case "medium":
      return "Medium priority";
    case "low":
      return "Low priority";
    default:
      return null;
  }
}

function InProgressEmptyState() {
  return (
    <div className="cc2-kcol-empty-state">
      <div className="cc2-kcol-empty-orbit" aria-hidden="true">
        <span className="cc2-kcol-empty-ring cc2-kcol-empty-ring--outer" />
        <span className="cc2-kcol-empty-ring cc2-kcol-empty-ring--tilt" />
        <span className="cc2-kcol-empty-planet" />
      </div>
      <p className="cc2-kcol-empty-title">Nothing in progress</p>
    </div>
  );
}

export function CommandKanban({ tasks }: CommandKanbanProps) {
  const { mode } = useCommandCenterMode();

  const filtered = tasks.filter((task) =>
    itemMatchesMode(task.lifeAreaName, mode),
  );

  return (
    <section className="cc2-tasks-panel" aria-label="Task board">
      <div className="cc2-kanban-title">
        <span className="cc2-kanban-title-label">Tasks</span>
      </div>

      <div className="cc2-kanban">
        {COLUMNS.map((column) => {
          const columnTasks = filtered.filter(
            (task) => task.status === column.key,
          );

          return (
            <div key={column.key} className="cc2-kcol">
              <div className="cc2-kcol-head">
                <span>{column.label}</span>
                <span className="cc2-kcol-count">{columnTasks.length}</span>
              </div>

              <div
                className="cc2-panel-scroll cc2-kcol-scroll"
                aria-label={`${column.label} tasks`}
                tabIndex={0}
              >
                {columnTasks.length === 0 ? (
                  column.key === "in_progress" ? (
                    <InProgressEmptyState />
                  ) : (
                    <p className="cc2-kcol-empty">No tasks</p>
                  )
                ) : (
                  columnTasks.map((task) => (
                    <KanbanCard
                      key={task.id}
                      task={task}
                      mode={mode}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function KanbanCard({
  task,
  mode,
}: {
  task: CommandCenterKanbanTask;
  mode: ReturnType<typeof useCommandCenterMode>["mode"];
}) {
  const canComplete = task.status === "todo" || task.status === "in_progress";
  const priority = priorityLabel(task.priority);
  const isDone = task.status === "done";

  return (
    <div className={`cc2-kcard cc2-kcard--${task.status}`}>
      <div className="cc2-kcard-top">
        {isDone ? (
          <span className="cc2-kcard-check cc2-kcard-check--done" aria-hidden="true">
            ✓
          </span>
        ) : (
          <span className="cc2-kcard-check" aria-hidden="true" />
        )}
        <div className="cc2-kcard-body">
          <div className="cc2-kcard-title-row">
            <div
              className="cc2-kcard-name"
              title={
                task.goalContext
                  ? `${task.goalContext.goalTitle} → ${task.goalContext.levelTitle}`
                  : undefined
              }
            >
              {task.title}
            </div>
            {!isDone ? (
              <span className={`cc2-kcard-tag cc2-kcard-tag--${mode}`}>
                {modeTagLabel(mode)}
              </span>
            ) : null}
          </div>
          {!isDone && priority ? (
            <div className={`cc2-kcard-priority cc2-kcard-priority--${task.priority}`}>
              {priority}
            </div>
          ) : null}
          {isDone && task.completedToday ? (
            <div className="cc2-kcard-done-label">Completed today</div>
          ) : null}
        </div>
        {canComplete ? (
          <form action={completeTaskFromDashboard} className="cc2-kcard-complete-form">
            <input type="hidden" name="taskId" value={task.id} />
            <button
              type="submit"
              className="cc2-kcard-move"
              aria-label={`Mark "${task.title}" as done`}
              title="Mark done"
            >
              ✓
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
