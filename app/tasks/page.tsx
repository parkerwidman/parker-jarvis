import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisPageHeader } from "@/components/jarvis/jarvis-page-header";
import {
  JarvisAlert,
  JarvisButton,
  JarvisCard,
  JarvisEmptyState,
  JarvisField,
  JarvisPageContent,
  jarvisInputProps,
} from "@/components/jarvis/jarvis-ui";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { completeTask, createTask } from "./actions";

function formatDueDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function isOverdue(dueAt: string): boolean {
  const due = new Date(dueAt);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  due.setUTCHours(0, 0, 0, 0);
  return due < today;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();

  if (authError || !authData?.claims) {
    redirect("/login");
  }

  const { data: tasks } = await supabase
    .from("jarvis_visible_tasks")
    .select("id, title, status, priority, due_at, created_at")
    .order("created_at", { ascending: false });

  const openTasks = (tasks ?? []).filter((task) => task.status !== "done");
  const completedTasks = (tasks ?? []).filter((task) => task.status === "done");

  return (
    <JarvisAppShell>
      <JarvisPageContent>
        <JarvisPageHeader
          title="Tasks"
          subtitle="Everything Jarvis needs to help you complete."
        />

        <JarvisCard title="Add task" accent="blue">
          <form action={createTask} className="jv-form">
            <JarvisField label="Task title">
              <input
                type="text"
                name="title"
                required
                maxLength={200}
                placeholder="What needs to get done?"
                {...jarvisInputProps()}
              />
            </JarvisField>

            <JarvisField label="Priority">
              <select name="priority" defaultValue="medium" {...jarvisInputProps()}>
                <option value="low">Low priority</option>
                <option value="medium">Medium priority</option>
                <option value="high">High priority</option>
              </select>
            </JarvisField>

            <JarvisField label="Due date">
              <input type="date" name="dueDate" {...jarvisInputProps()} />
            </JarvisField>

            {error ? <JarvisAlert variant="error">{error}</JarvisAlert> : null}

            <JarvisButton type="submit" className="jv-btn--block">
              Add task
            </JarvisButton>
          </form>
        </JarvisCard>

        <section className="jv-list-section" aria-label="Open tasks">
          <h2 className="jv-section-label">
            Open tasks
            {openTasks.length > 0 ? (
              <span className="jv-section-count">{openTasks.length}</span>
            ) : null}
          </h2>

          {openTasks.length > 0 ? (
            <ul className="jv-task-list">
              {openTasks.map((task) => {
                const overdue = task.due_at ? isOverdue(task.due_at) : false;

                return (
                  <li
                    key={task.id}
                    className={`jv-task-item${overdue ? " jv-task-item--overdue" : ""}`}
                  >
                    <span className="jv-task-check" aria-hidden="true" />
                    <div className="jv-task-body">
                      <span className="jv-task-title">{task.title}</span>
                      {task.due_at ? (
                        <span className="jv-task-meta">
                          Due {formatDueDate(task.due_at)}
                          {overdue ? (
                            <span className="jv-task-overdue"> · Overdue</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="jv-task-meta">No due date</span>
                      )}
                    </div>
                    <div className="jv-task-actions">
                      <span className="jv-priority-badge">{task.priority}</span>
                      <form action={completeTask}>
                        <input type="hidden" name="taskId" value={task.id} />
                        <JarvisButton type="submit" variant="secondary">
                          Complete
                        </JarvisButton>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <JarvisEmptyState
              title="No open tasks"
              description="Add one above to get started."
            />
          )}
        </section>

        {completedTasks.length > 0 ? (
          <section className="jv-list-section" aria-label="Completed tasks">
            <h2 className="jv-section-label">
              Completed
              <span className="jv-section-count">{completedTasks.length}</span>
            </h2>
            <ul className="jv-task-list jv-task-list--completed">
              {completedTasks.map((task) => (
                <li key={task.id} className="jv-task-item jv-task-item--done">
                  <span className="jv-task-check jv-task-check--done" aria-hidden="true" />
                  <div className="jv-task-body">
                    <span className="jv-task-title">{task.title}</span>
                    {task.due_at ? (
                      <span className="jv-task-meta">
                        Due {formatDueDate(task.due_at)}
                      </span>
                    ) : null}
                  </div>
                  <span className="jv-badge jv-badge--idle">Completed</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
