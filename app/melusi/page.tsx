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
import { getLifeAreaModule } from "@/lib/jarvis/life-areas/module-registry";
import { loadLifeAreaDashboard } from "@/lib/jarvis/life-areas/load-life-area-dashboard";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createMelusiProject } from "./actions";
import { MelusiProjectStatusForm } from "./melusi-project-status-form";

function formatDueDate(isoString: string, timeZone: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

function formatTargetDate(dateString: string): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
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

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="la-stat">
      <span className="la-stat-value">{value}</span>
      <span className="la-stat-label">{label}</span>
    </div>
  );
}

export default async function MelusiPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; updated?: string }>;
}) {
  const { error, created, updated } = await searchParams;
  const module = getLifeAreaModule("melusi");

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

  const data = await loadLifeAreaDashboard(supabase, userId, "melusi");
  const hasAnyData =
    data.lifeArea !== null &&
    (data.projects.length > 0 ||
      data.tasks.length > 0 ||
      data.goals.length > 0 ||
      data.memories.length > 0);

  return (
    <JarvisAppShell mainClassName="app-main--life-area">
      <JarvisPageContent className="jv-page-content--life-area">
        <JarvisPageHeader
          title={module.displayName}
          subtitle={module.purpose}
          backHref="/"
          backLabel="Command Center"
        />

        <section className="la-stat-grid" aria-label="Melusi overview">
          <StatCard label="Active projects" value={data.counts.activeProjects} />
          <StatCard label="Open tasks" value={data.counts.unfinishedTasks} />
          <StatCard label="Active goals" value={data.counts.activeGoals} />
          <StatCard label="Saved memories" value={data.counts.activeMemories} />
        </section>

        {created ? (
          <JarvisAlert variant="success">Project created.</JarvisAlert>
        ) : null}
        {updated ? (
          <JarvisAlert variant="success">Project status updated.</JarvisAlert>
        ) : null}
        {error ? <JarvisAlert variant="error">{error}</JarvisAlert> : null}

        {!hasAnyData ? (
          <JarvisEmptyState
            title="Melusi is ready"
            description="Create your first project below to start tracking business work in Jarvis."
          />
        ) : null}

        <div className="la-dashboard-grid">
          <div className="la-dashboard-col la-dashboard-col--primary">
            <JarvisCard title="New project" accent="cyan">
              <form action={createMelusiProject} className="jv-form la-compact-form">
                <JarvisField label="Project name">
                  <input
                    type="text"
                    name="name"
                    required
                    maxLength={200}
                    placeholder="What are you building?"
                    {...jarvisInputProps()}
                  />
                </JarvisField>

                <JarvisField label="Description">
                  <textarea
                    name="description"
                    rows={2}
                    maxLength={2000}
                    placeholder="Optional context"
                    className="jv-input la-textarea"
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
                  Create project
                </JarvisButton>
              </form>
            </JarvisCard>

            <section className="jv-list-section" aria-label="Melusi projects">
              <h2 className="jv-section-label">
                Projects
                {data.projects.length > 0 ? (
                  <span className="jv-section-count">{data.projects.length}</span>
                ) : null}
              </h2>

              {data.projects.length > 0 ? (
                <ul className="la-project-list">
                  {data.projects.map((project) => (
                    <li key={project.id} className="la-project-item">
                      <div className="la-project-main">
                        <div className="la-project-heading">
                          <span className="la-project-name">{project.name}</span>
                          <span className={projectStatusBadgeClass(project.status)}>
                            {projectStatusLabel(project.status)}
                          </span>
                        </div>
                        {project.description ? (
                          <p className="la-project-description">
                            {project.description}
                          </p>
                        ) : null}
                        <div className="la-project-meta">
                          <span className="jv-priority-badge">{project.priority}</span>
                          {project.dueAt ? (
                            <span className="la-project-due">
                              Due {formatDueDate(project.dueAt, data.timezone)}
                            </span>
                          ) : (
                            <span className="la-project-due">No due date</span>
                          )}
                        </div>
                      </div>
                      <MelusiProjectStatusForm
                        projectId={project.id}
                        projectName={project.name}
                        currentStatus={project.status}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <JarvisEmptyState
                  title="No projects yet"
                  description="Use the form above to add your first Melusi project."
                />
              )}
            </section>
          </div>

          <div className="la-dashboard-col">
            <JarvisCard title="Tasks" accent="cyan">
              {data.tasks.length > 0 ? (
                <>
                  <ul className="la-task-list">
                    {data.tasks.map((task) => (
                      <li
                        key={task.id}
                        className={`la-task-item${task.overdue ? " la-task-item--overdue" : ""}`}
                      >
                        <span className="jv-task-check" aria-hidden="true" />
                        <div className="jv-task-body">
                          <span className="jv-task-title">{task.title}</span>
                          <span className="jv-task-meta">
                            {task.dueAt ? (
                              <>
                                Due {formatDueDate(task.dueAt, data.timezone)}
                                {task.overdue ? (
                                  <span className="jv-task-overdue"> · Overdue</span>
                                ) : null}
                              </>
                            ) : (
                              "No due date"
                            )}
                          </span>
                        </div>
                        <span className="jv-priority-badge">{task.priority}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/tasks" className="la-card-link">
                    View all tasks →
                  </Link>
                </>
              ) : (
                <JarvisEmptyState
                  title="No Melusi tasks"
                  description="Tasks assigned to Melusi will appear here."
                />
              )}
            </JarvisCard>

            <JarvisCard title="Goals" accent="cyan">
              {data.goals.length > 0 ? (
                <ul className="la-goal-list">
                  {data.goals.map((goal) => (
                    <li key={goal.id} className="la-goal-item">
                      <span className="la-goal-marker" aria-hidden="true" />
                      <div className="la-goal-body">
                        <span className="la-goal-title">{goal.title}</span>
                        {goal.description ? (
                          <p className="la-goal-description">{goal.description}</p>
                        ) : null}
                        {goal.successDefinition ? (
                          <p className="la-goal-success">
                            Success: {goal.successDefinition}
                          </p>
                        ) : null}
                        <div className="la-goal-meta">
                          <span className="jv-priority-badge">{goal.priority}</span>
                          {goal.targetDate ? (
                            <span className="la-goal-target">
                              Target {formatTargetDate(goal.targetDate)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <JarvisEmptyState
                  title="No active goals"
                  description="Melusi goals will appear here when added."
                />
              )}
            </JarvisCard>

            <JarvisCard title="Memory" accent="cyan">
              {data.memories.length > 0 ? (
                <ul className="la-memory-list">
                  {data.memories.map((memory) => (
                    <li key={memory.id} className="la-memory-item">
                      <p className="la-memory-content">{memory.content}</p>
                      <span className="la-memory-category">{memory.category}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <JarvisEmptyState
                  title="No Melusi memories"
                  description="Saved context for Melusi will appear here."
                />
              )}
            </JarvisCard>
          </div>
        </div>
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
