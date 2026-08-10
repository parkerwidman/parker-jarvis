"use client";

import { completeTaskFromDashboard } from "@/app/command-center/actions";
import { useCommandCenterMode } from "./command-center-mode-provider";
import {
  itemMatchesMode,
  modeLabel,
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

export function CommandKanban({ tasks }: CommandKanbanProps) {
  const { mode } = useCommandCenterMode();

  const filtered = tasks.filter((task) =>
    itemMatchesMode(task.lifeAreaName, mode),
  );

  return (
    <section aria-label="Task board">
      <div className="cc2-kanban-title">
        <span>Board</span>
        <span className="cc2-kanban-mode-tag">Showing {modeLabel(mode)}</span>
      </div>

      <div className="cc2-kanban">
        {COLUMNS.map((column) => {
          const columnTasks = filtered.filter(
            (task) => task.status === column.key,
          );

          return (
            <div key={column.key} className="cc2-kcol">
              <div className="cc2-kcol-head">
                {column.label}
                <span className="cc2-kcol-count">{columnTasks.length}</span>
              </div>

              <div
                className="cc2-panel-scroll cc2-kcol-scroll"
                aria-label={`${column.label} tasks`}
                tabIndex={0}
              >
                {columnTasks.length === 0 ? (
                  <p className="cc2-kcol-empty">No tasks</p>
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

  return (
    <div className="cc2-kcard">
      <div className="cc2-kcard-name">{task.title}</div>
      {task.goalContext ? (
        <div className="cc2-kcard-context">
          {task.goalContext.goalTitle} → {task.goalContext.levelTitle}
        </div>
      ) : null}
      <div className="cc2-kcard-foot">
        <span className="cc2-kcard-tag">{modeTagLabel(mode)}</span>
        {task.goalContext?.isTodayPriority ? (
          <span className="cc2-kcard-priority" title="Today's priority goal">
            ★
          </span>
        ) : null}
        {canComplete ? (
          <form action={completeTaskFromDashboard}>
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
        ) : (
          <span className="cc2-kcard-done" aria-hidden="true">
            ✓
          </span>
        )}
      </div>
    </div>
  );
}
