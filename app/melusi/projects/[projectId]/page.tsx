import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisPageHeader } from "@/components/jarvis/jarvis-page-header";
import { JarvisContextLink } from "@/components/jarvis/context/jarvis-context-link";
import {
  JarvisAlert,
  JarvisButton,
  JarvisCard,
  JarvisEmptyState,
  JarvisField,
  JarvisPageContent,
  jarvisInputProps,
} from "@/components/jarvis/jarvis-ui";
import { loadMelusiProjectWorkspace } from "@/lib/jarvis/projects/load-melusi-project-workspace";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import {
  completeMelusiProjectTask,
  createMelusiProjectTask,
  createMelusiProjectUpdate,
} from "../actions";

function formatDueDate(isoString: string, timeZone: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

function projectStatusLabel(status: string): string {
  switch (status) {
    case "idea":
      return "Idea";
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "completed":
      return "Completed";
    case "archived":
      return "Archived";
    default:
      return status;
  }
}

function projectStatusBadgeClass(status: string): string {
  switch (status) {
    case "idea":
      return "la-status-badge la-status-badge--idea";
    case "active":
      return "la-status-badge la-status-badge--active";
    case "paused":
      return "la-status-badge la-status-badge--paused";
    case "completed":
      return "la-status-badge la-status-badge--completed";
    case "archived":
      return "la-status-badge la-status-badge--archived";
    default:
      return "la-status-badge";
  }
}

function updateTypeLabel(updateType: string): string {
  switch (updateType) {
    case "progress":
      return "Progress";
    case "blocker":
      return "Blocker";
    case "decision":
      return "Decision";
    case "note":
      return "Note";
    default:
      return updateType;
  }
}

function updateTypeBadgeClass(updateType: string): string {
  switch (updateType) {
    case "progress":
      return "la-update-type-badge la-update-type-badge--progress";
    case "blocker":
      return "la-update-type-badge la-update-type-badge--blocker";
    case "decision":
      return "la-update-type-badge la-update-type-badge--decision";
    case "note":
      return "la-update-type-badge la-update-type-badge--note";
    default:
      return "la-update-type-badge";
  }
}

function formatDateTime(isoString: string, timeZone: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export default async function MelusiProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    error?: string;
    created?: string;
    completed?: string;
    updateAdded?: string;
  }>;
}) {
  const { projectId } = await params;
  const { error, created, completed, updateAdded } = await searchParams;

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();

  if (authError || !authData?.claims) {
    redirect("/login");
  }

  const userId =
    typeof authData.claims.sub === "string" ? authData.claims.sub : null;

  if (!userId) {
    redirect("/login");
  }

  const workspace = await loadMelusiProjectWorkspace(
    supabase,
    userId,
    projectId,
  );

  if (!workspace.success) {
    notFound();
  }

  const { project, unfinishedTasks, completedTasks, taskCounts, recentUpdates, timezone } =
    workspace.data;

  return (
    <JarvisAppShell mainClassName="app-main--life-area">
      <JarvisPageContent className="jv-page-content--life-area">
        <JarvisPageHeader
          title={project.name}
          subtitle="Melusi project workspace"
          backHref="/melusi"
          backLabel="Melusi"
        />

        {created ? (
          <JarvisAlert variant="success">Task added to project.</JarvisAlert>
        ) : null}
        {completed ? (
          <JarvisAlert variant="success">Task completed.</JarvisAlert>
        ) : null}
        {updateAdded ? (
          <JarvisAlert variant="success">Project update recorded.</JarvisAlert>
        ) : null}
        {error ? <JarvisAlert variant="error">{error}</JarvisAlert> : null}

        <section className="la-project-workspace-meta" aria-label="Project details">
          <div className="la-project-heading">
            <span className={projectStatusBadgeClass(project.status)}>
              {projectStatusLabel(project.status)}
            </span>
            <span className="jv-priority-badge">{project.priority}</span>
            {project.dueAt ? (
              <span className="la-project-due">
                Due {formatDueDate(project.dueAt, timezone)}
              </span>
            ) : (
              <span className="la-project-due">No due date</span>
            )}
          </div>
          {project.description ? (
            <p className="la-project-description">{project.description}</p>
          ) : null}
          <p className="la-project-task-count">
            {taskCounts.completed} of {taskCounts.total} tasks completed
          </p>
          <JarvisContextLink target={{ type: "melusi_project", id: project.id }}>
            Ask Jarvis about this project
          </JarvisContextLink>
        </section>

        <div className="la-dashboard-grid">
          <div className="la-dashboard-col la-dashboard-col--primary">
            <JarvisCard title="Add project task" accent="cyan">
              <form
                action={createMelusiProjectTask}
                className="jv-form la-compact-form"
              >
                <input type="hidden" name="projectId" value={project.id} />
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

                <div className="la-form-row">
                  <JarvisField label="Priority">
                    <select
                      name="priority"
                      defaultValue="medium"
                      {...jarvisInputProps()}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </JarvisField>

                  <JarvisField label="Due date">
                    <input type="date" name="dueDate" {...jarvisInputProps()} />
                  </JarvisField>
                </div>

                <JarvisButton type="submit" className="jv-btn--block la-btn--cyan">
                  Add task
                </JarvisButton>
              </form>
            </JarvisCard>

            <section className="jv-list-section" aria-label="Unfinished project tasks">
              <h2 className="jv-section-label">
                Unfinished tasks
                {unfinishedTasks.length > 0 ? (
                  <span className="jv-section-count">{unfinishedTasks.length}</span>
                ) : null}
              </h2>

              {unfinishedTasks.length > 0 ? (
                <ul className="jv-task-list">
                  {unfinishedTasks.map((task) => (
                    <li
                      key={task.id}
                      className={`jv-task-item${task.overdue ? " jv-task-item--overdue" : ""}`}
                    >
                      <span className="jv-task-check" aria-hidden="true" />
                      <div className="jv-task-body">
                        <span className="jv-task-title">{task.title}</span>
                        <span className="jv-task-meta">
                          {task.dueAt ? (
                            <>
                              Due {formatDueDate(task.dueAt, timezone)}
                              {task.overdue ? (
                                <span className="jv-task-overdue"> · Overdue</span>
                              ) : null}
                            </>
                          ) : (
                            "No due date"
                          )}
                        </span>
                      </div>
                      <div className="jv-task-actions">
                        <JarvisContextLink
                          target={{ type: "task", id: task.id }}
                          className="jarvis-context-link jarvis-context-link--compact"
                        >
                          Ask Jarvis
                        </JarvisContextLink>
                        <span className="jv-priority-badge">{task.priority}</span>
                        <form action={completeMelusiProjectTask}>
                          <input type="hidden" name="projectId" value={project.id} />
                          <input type="hidden" name="taskId" value={task.id} />
                          <JarvisButton type="submit" variant="secondary">
                            Complete
                          </JarvisButton>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <JarvisEmptyState
                  title="No unfinished tasks"
                  description="Add a task above to start tracking work for this project."
                />
              )}
            </section>
          </div>

          <div className="la-dashboard-col">
            <JarvisCard title="Project updates" accent="cyan">
              <form
                action={createMelusiProjectUpdate}
                className="jv-form la-compact-form la-project-update-form"
              >
                <input type="hidden" name="projectId" value={project.id} />
                <div className="la-form-row">
                  <JarvisField label="Update type">
                    <select
                      name="updateType"
                      defaultValue="progress"
                      required
                      {...jarvisInputProps()}
                    >
                      <option value="progress">Progress</option>
                      <option value="blocker">Blocker</option>
                      <option value="decision">Decision</option>
                      <option value="note">Note</option>
                    </select>
                  </JarvisField>
                </div>
                <JarvisField label="Update">
                  <textarea
                    name="content"
                    required
                    maxLength={5000}
                    rows={3}
                    placeholder="Record progress, a blocker, a decision, or a note."
                    {...jarvisInputProps()}
                  />
                </JarvisField>
                <JarvisButton type="submit" className="jv-btn--block la-btn--cyan">
                  Add update
                </JarvisButton>
              </form>

              {recentUpdates.length > 0 ? (
                <ul
                  className="la-project-update-list"
                  aria-label="Recent project updates"
                >
                  {recentUpdates.map((update) => (
                    <li key={update.id} className="la-project-update-item">
                      <div className="la-project-update-heading">
                        <span className={updateTypeBadgeClass(update.updateType)}>
                          {updateTypeLabel(update.updateType)}
                        </span>
                        <time
                          className="la-project-update-time"
                          dateTime={update.createdAt}
                        >
                          {formatDateTime(update.createdAt, timezone)}
                        </time>
                      </div>
                      <p className="la-project-update-content">{update.content}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <JarvisEmptyState
                  title="No project updates yet"
                  description="Record progress, blockers, decisions, or notes as you work on this project."
                />
              )}
            </JarvisCard>

            {completedTasks.length > 0 ? (
              <JarvisCard title="Completed tasks" accent="cyan">
                <ul className="jv-task-list jv-task-list--completed">
                  {completedTasks.map((task) => (
                    <li key={task.id} className="jv-task-item jv-task-item--done">
                      <span
                        className="jv-task-check jv-task-check--done"
                        aria-hidden="true"
                      />
                      <div className="jv-task-body">
                        <span className="jv-task-title">{task.title}</span>
                        {task.dueAt ? (
                          <span className="jv-task-meta">
                            Due {formatDueDate(task.dueAt, timezone)}
                          </span>
                        ) : null}
                      </div>
                      <JarvisContextLink
                        target={{ type: "task", id: task.id }}
                        className="jarvis-context-link jarvis-context-link--compact"
                      >
                        Ask Jarvis
                      </JarvisContextLink>
                    </li>
                  ))}
                </ul>
              </JarvisCard>
            ) : (
              <JarvisCard title="Completed tasks" accent="cyan">
                <JarvisEmptyState
                  title="No completed tasks yet"
                  description="Finished project tasks will appear here."
                />
              </JarvisCard>
            )}
          </div>
        </div>
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
