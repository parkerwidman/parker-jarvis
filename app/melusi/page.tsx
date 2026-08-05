import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { CommandCenterContextLayout } from "@/components/jarvis/command-center-context-layout";
import { JarvisContextButton } from "@/components/jarvis/context/jarvis-context-button";
import { JarvisContextLink } from "@/components/jarvis/context/jarvis-context-link";
import { MelusiJarvisPanel } from "@/components/melusi/melusi-jarvis-panel";
import { MelusiNav } from "@/components/melusi/melusi-nav";
import {
  JarvisAlert,
  JarvisButton,
  JarvisCard,
  JarvisEmptyState,
  JarvisField,
  JarvisPageContent,
  jarvisInputProps,
} from "@/components/jarvis/jarvis-ui";
import { loadRecentThreadMessages } from "@/lib/jarvis/agents/agent-message-tools";
import { findMelusiCommandThread } from "@/lib/jarvis/agents/agent-thread-tools";
import { toChatInitialMessages } from "@/lib/jarvis/agents/load-agent-thread";
import { loadMelusiCommandCenter } from "@/lib/jarvis/melusi/load-melusi-command-center";
import {
  loadSafeMetricoolConnection,
  toCommandCenterStatus,
} from "@/lib/jarvis/integrations/metricool/metricool-connection-tools";
import {
  loadMetricoolSocialDashboard,
  toSocialCommandCenterSummary,
} from "@/lib/jarvis/integrations/metricool/metricool-social-dashboard";
import {
  MELUSI_INTEGRATIONS,
  MELUSI_PRODUCT_LINES,
} from "@/lib/jarvis/melusi/product-config";
import { loadLifeAreaDashboard } from "@/lib/jarvis/life-areas/load-life-area-dashboard";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createMelusiProject } from "./actions";
import { MelusiProjectStatusForm } from "./melusi-project-status-form";

function formatDueDate(isoString: string, timeZone: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  });
}

function formatActivityTime(isoString: string, timeZone: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
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

function ConnectionStat({
  label,
  setupHint,
  href,
  statusLabel,
  connected = false,
}: {
  label: string;
  setupHint: string;
  href: string | null;
  statusLabel?: string;
  connected?: boolean;
}) {
  const content = (
    <>
      <span
        className={`melusi-stat-icon${connected ? " melusi-stat-icon--real" : " melusi-stat-icon--disconnected"}`}
        aria-hidden="true"
      />
      <div className="cc-stat-body">
        <span className="melusi-stat-status">
          {statusLabel ?? (connected ? "Connected" : "Not connected")}
        </span>
        <span className="cc-stat-label">{label}</span>
        <span className="cc-stat-meta">{setupHint}</span>
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={`cc-stat melusi-stat${connected ? "" : " melusi-stat--disconnected"}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      className={`cc-stat melusi-stat${connected ? "" : " melusi-stat--disconnected"}`}
    >
      {content}
    </div>
  );
}

function RealStatCard({
  label,
  value,
  meta,
  href,
}: {
  label: string;
  value: number;
  meta: string;
  href: string;
}) {
  return (
    <Link href={href} className="cc-stat melusi-stat">
      <span className="melusi-stat-icon melusi-stat-icon--real" aria-hidden="true" />
      <div className="cc-stat-body">
        <span className="cc-stat-value">{value}</span>
        <span className="cc-stat-label">{label}</span>
        <span className="cc-stat-meta">{meta}</span>
      </div>
    </Link>
  );
}

function Panel({
  title,
  href,
  hrefLabel,
  accent,
  children,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
  accent?: "blue" | "purple" | "amber" | "green";
  children: ReactNode;
}) {
  const accentClass = accent ? ` cc-card--${accent}` : "";

  return (
    <section className={`cc-card${accentClass}`}>
      <div className="cc-card-header">
        <h2 className="cc-card-title">{title}</h2>
        {href && hrefLabel ? (
          <Link href={href} className="cc-card-link">
            {hrefLabel}
          </Link>
        ) : null}
      </div>
      <div className="cc-card-body">{children}</div>
    </section>
  );
}

export default async function MelusiPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; updated?: string }>;
}) {
  const { error, created, updated } = await searchParams;
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

  const [data, dashboard, commandThread, metricoolConnection] = await Promise.all([
    loadMelusiCommandCenter(supabase, userId),
    loadLifeAreaDashboard(supabase, userId, "melusi"),
    findMelusiCommandThread(supabase, userId),
    loadSafeMetricoolConnection(supabase, userId),
  ]);

  const socialConnected = metricoolConnection.status === "connected";
  const socialDashboard = socialConnected
    ? await loadMetricoolSocialDashboard(
        supabase,
        userId,
        process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
      )
    : null;
  const socialSummary =
    socialDashboard?.ok === true
      ? toSocialCommandCenterSummary(socialDashboard.snapshot)
      : null;

  const commandMessages = commandThread
    ? toChatInitialMessages(
        await loadRecentThreadMessages(supabase, userId, commandThread.id),
      )
    : [];

  const expandHref = commandThread
    ? `/melusi/threads/${commandThread.id}`
    : "/melusi/threads";

  const revenueIntegration = MELUSI_INTEGRATIONS.find((i) => i.key === "revenue")!;
  const socialIntegration = MELUSI_INTEGRATIONS.find((i) => i.key === "social")!;
  const socialCommandStatus = toCommandCenterStatus(metricoolConnection);
  const socialStatusLabel =
    socialCommandStatus === "connected"
      ? "Connected"
      : socialCommandStatus === "reconnect_required"
        ? "Reconnect required"
        : socialCommandStatus === "error"
          ? "Error"
          : socialCommandStatus === "connecting"
            ? "Connecting"
            : "Setup required";
  const socialSetupHint =
    socialCommandStatus === "connected"
      ? socialSummary
        ? `${socialSummary.recentPublicationCount} recent posts · ${socialSummary.alertCount} important alerts`
        : "Metricool verified for Melusi read-only access."
      : socialCommandStatus === "reconnect_required"
        ? "Metricool authorization needs to be renewed."
        : socialCommandStatus === "error"
          ? "Metricool connection needs attention on the Social page."
          : socialCommandStatus === "connecting"
            ? "Metricool OAuth is in progress."
            : socialIntegration.setupHint;
  const leadsIntegration = MELUSI_INTEGRATIONS.find((i) => i.key === "leads")!;

  return (
    <JarvisAppShell mainClassName="app-main--command-center">
      <JarvisPageContent className="jv-page-content--melusi-command">
        <header className="cc-header melusi-header">
          <div className="cc-header-copy">
            <h1 className="cc-greeting melusi-greeting">
              Melusi <span>Command Center</span>
            </h1>
            <p className="cc-header-sub">
              Business intelligence for {data.preferredName}&apos;s company.
            </p>
          </div>
          <div className="cc-header-meta">
            <time className="cc-header-date" dateTime={data.todayDate}>
              {data.todayDateLabel}
            </time>
          </div>
        </header>

        <MelusiNav />

        <section className="cc-stat-grid melusi-stat-grid" aria-label="Business status">
          <ConnectionStat
            label={revenueIntegration.label}
            setupHint={revenueIntegration.setupHint}
            href={revenueIntegration.futureRoute}
          />
          <ConnectionStat
            label={socialIntegration.label}
            setupHint={socialSetupHint}
            href={socialIntegration.futureRoute}
            statusLabel={socialStatusLabel}
            connected={socialCommandStatus === "connected"}
          />
          <ConnectionStat
            label="New leads"
            setupHint={leadsIntegration.setupHint}
            href={null}
          />
          <ConnectionStat
            label="Leads needing follow-up"
            setupHint="Lead follow-up tracking is not connected yet."
            href={null}
          />
        </section>

        <section
          className="cc-stat-grid melusi-stat-grid melusi-stat-grid--secondary"
          aria-label="Stored Melusi records"
        >
          <RealStatCard
            label="Active projects"
            value={data.counts.activeProjects}
            meta="From stored projects"
            href="/melusi#projects"
          />
          <RealStatCard
            label="Open Melusi tasks"
            value={data.counts.unfinishedTasks}
            meta={
              data.counts.overdueTasks > 0
                ? `${data.counts.overdueTasks} overdue`
                : "Scoped to Melusi"
            }
            href="/tasks"
          />
          <RealStatCard
            label="Recorded blockers"
            value={data.counts.blockers}
            meta="From project updates"
            href="/melusi#activity"
          />
          <RealStatCard
            label="Pending approvals"
            value={data.counts.pendingApprovals}
            meta={
              data.counts.pendingApprovals > 0
                ? "Require review"
                : "Nothing pending"
            }
            href="/approvals"
          />
        </section>

        {created ? (
          <JarvisAlert variant="success">Project created.</JarvisAlert>
        ) : null}
        {updated ? (
          <JarvisAlert variant="success">Project status updated.</JarvisAlert>
        ) : null}
        {error ? <JarvisAlert variant="error">{error}</JarvisAlert> : null}

        <CommandCenterContextLayout>
          <MelusiJarvisPanel
            userName={data.preferredName}
            threadId={commandThread?.id ?? null}
            initialMessages={commandMessages}
            expandHref={expandHref}
            socialConnected={socialConnected}
          />

          <div className="cc-dashboard-grid melusi-dashboard-grid">
            <div className="cc-dashboard-col">
              {socialConnected && socialSummary ? (
                <Panel
                  title="Social Command Center"
                  href="/melusi/social"
                  hrefLabel="Open social dashboard"
                  accent="purple"
                >
                  <ul className="social-overview-list">
                    <li>
                      <span>Connection</span>
                      <strong>Connected</strong>
                    </li>
                    <li>
                      <span>Static cadence</span>
                      <strong>{socialSummary.cadenceStaticPace ?? "—"}</strong>
                    </li>
                    <li>
                      <span>Reel cadence</span>
                      <strong>{socialSummary.cadenceReelPace ?? "—"}</strong>
                    </li>
                    <li>
                      <span>Important alerts</span>
                      <strong>{socialSummary.alertCount}</strong>
                    </li>
                    <li>
                      <span>Recent publications</span>
                      <strong>{socialSummary.recentPublicationCount}</strong>
                    </li>
                    <li>
                      <span>Upcoming scheduled</span>
                      <strong>{socialSummary.upcomingScheduledCount}</strong>
                    </li>
                  </ul>
                  {socialSummary.refreshedAt ? (
                    <p className="cc-empty social-overview-refreshed">
                      Refreshed{" "}
                      {formatActivityTime(socialSummary.refreshedAt, data.timezone)}
                    </p>
                  ) : null}
                </Panel>
              ) : null}
              <Panel
                title="Recommended actions"
                href="/melusi/threads"
                hrefLabel="Open threads"
                accent="blue"
              >
                {data.recommendations.length > 0 ? (
                  <ul className="melusi-rec-list">
                    {data.recommendations.map((rec) => (
                      <li key={rec.id} className="melusi-rec-item">
                        <span
                          className={`melusi-rec-badge melusi-rec-badge--${rec.kind}`}
                        >
                          {rec.kind === "deterministic" ? "Alert" : "Recorded"}
                        </span>
                        <div className="melusi-rec-body">
                          <span className="melusi-rec-title">{rec.title}</span>
                          <p className="melusi-rec-detail">{rec.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cc-empty">
                    Recommendations appear from stored projects, tasks, blockers,
                    and approvals.
                  </p>
                )}
              </Panel>

              <Panel title="Current priorities" accent="blue">
                {data.tasks.length > 0 ? (
                  <ul className="cc-task-list">
                    {data.tasks.map((task) => (
                      <li
                        key={task.id}
                        className={`cc-task-row${task.overdue ? " cc-task-row--overdue" : ""}`}
                      >
                        <span className="cc-task-check" aria-hidden="true" />
                        <div className="cc-task-main">
                          <span className="cc-task-title">{task.title}</span>
                          <span className="cc-task-due">
                            {task.dueAt
                              ? `Due ${formatDueDate(task.dueAt, data.timezone)}`
                              : "No due date"}
                            {task.overdue ? (
                              <span className="cc-task-overdue-label"> · Overdue</span>
                            ) : null}
                          </span>
                        </div>
                        <JarvisContextButton
                          target={{ type: "task", id: task.id }}
                          displayLabel={task.title}
                        >
                          Ask Melusi Jarvis
                        </JarvisContextButton>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cc-empty">No open Melusi tasks right now.</p>
                )}
              </Panel>
            </div>

            <div className="cc-dashboard-col">
              <Panel
                title="Problems & alerts"
                href="/approvals"
                hrefLabel="Review approvals"
                accent="amber"
              >
                {data.alerts.length > 0 ? (
                  <ul className="melusi-alert-list">
                    {data.alerts.map((alert) => (
                      <li key={alert.id} className="melusi-alert-item">
                        <span className={`melusi-alert-badge melusi-alert-badge--${alert.kind}`}>
                          {alert.kind}
                        </span>
                        <div>
                          <span className="melusi-alert-title">{alert.title}</span>
                          <p className="melusi-alert-detail">{alert.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cc-empty">
                    No blockers, overdue tasks, or pending approvals detected from
                    stored data.
                  </p>
                )}
              </Panel>

              <Panel
                title="Recent Melusi activity"
                href="/melusi#activity"
                hrefLabel="View projects"
                accent="purple"
              >
                {data.recentActivity.length > 0 ? (
                  <ul className="melusi-activity-list">
                    {data.recentActivity.map((activity) => (
                      <li key={activity.id} className="melusi-activity-item">
                        <div className="melusi-activity-heading">
                          <span className="melusi-activity-project">
                            {activity.projectName}
                          </span>
                          <span className="melusi-activity-type">
                            {updateTypeLabel(activity.updateType)}
                          </span>
                        </div>
                        <p className="melusi-activity-content">{activity.content}</p>
                        <time
                          className="melusi-activity-time"
                          dateTime={activity.createdAt}
                        >
                          {formatActivityTime(activity.createdAt, data.timezone)}
                        </time>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cc-empty">
                    Project updates will appear here when recorded.
                  </p>
                )}
              </Panel>
            </div>

            <div className="cc-dashboard-col cc-dashboard-col--narrow">
              <Panel title="Product surfaces" accent="green">
                <ul className="melusi-product-list">
                  {MELUSI_PRODUCT_LINES.map((line) => (
                    <li key={line.name} className="melusi-product-line">
                      <div className="melusi-product-heading">
                        <span className="melusi-product-name">{line.name}</span>
                        <span className="melusi-product-audience">{line.audience}</span>
                      </div>
                      <ul className="melusi-surface-list">
                        {line.surfaces.map((surface) => (
                          <li key={surface.url}>
                            <span className="melusi-surface-label">{surface.label}</span>
                            <span className="melusi-surface-url">{surface.url}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="melusi-surface-note">
                        Configured surface — connection and analytics not live yet.
                      </p>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title="Approvals" href="/approvals" hrefLabel="Review all" accent="amber">
                {data.approvals.length > 0 ? (
                  <ul className="cc-approval-list">
                    {data.approvals.map((approval) => (
                      <li key={approval.id} className="cc-approval-row">
                        <div className="cc-approval-main">
                          <span className="cc-approval-title">{approval.title}</span>
                          <p className="cc-approval-summary">{approval.summary}</p>
                        </div>
                        <Link href="/approvals" className="cc-review-link">
                          Review
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cc-empty">No pending approvals.</p>
                )}
              </Panel>
            </div>
          </div>
        </CommandCenterContextLayout>

        <section id="projects" className="melusi-projects-section" aria-label="Melusi projects">
          <div className="melusi-projects-header">
            <h2 className="jv-section-label">Projects & tasks</h2>
            <p className="melusi-projects-sub">
              Stored Melusi work — project workspaces and updates remain unchanged.
            </p>
          </div>

          <div className="la-dashboard-grid melusi-projects-grid">
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

              {dashboard.projects.length > 0 ? (
                <ul className="la-project-list">
                  {dashboard.projects.map((project) => (
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
                      <div className="la-project-actions">
                        <Link
                          href={`/melusi/projects/${project.id}`}
                          className="la-card-link"
                        >
                          Open project
                        </Link>
                        <JarvisContextLink
                          target={{ type: "melusi_project", id: project.id }}
                        >
                          Ask Melusi Jarvis
                        </JarvisContextLink>
                        <MelusiProjectStatusForm
                          projectId={project.id}
                          projectName={project.name}
                          currentStatus={project.status}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <JarvisEmptyState
                  title="No projects yet"
                  description="Create a project above to start tracking Melusi work."
                />
              )}
            </div>

            <div className="la-dashboard-col">
              <JarvisCard title="Melusi tasks" accent="cyan">
                {dashboard.tasks.length > 0 ? (
                  <>
                    <ul className="la-task-list">
                      {dashboard.tasks.map((task) => (
                        <li
                          key={task.id}
                          className={`la-task-item${task.overdue ? " la-task-item--overdue" : ""}`}
                        >
                          <span className="jv-task-check" aria-hidden="true" />
                          <div className="jv-task-body">
                            <span className="jv-task-title">{task.title}</span>
                            <span className="jv-task-meta">
                              {task.dueAt
                                ? `Due ${formatDueDate(task.dueAt, data.timezone)}`
                                : "No due date"}
                            </span>
                          </div>
                          <JarvisContextLink
                            target={{ type: "task", id: task.id }}
                            className="jarvis-context-link jarvis-context-link--compact"
                          >
                            Ask Melusi Jarvis
                          </JarvisContextLink>
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
                    description="Melusi-scoped tasks without a project appear here."
                  />
                )}
              </JarvisCard>
            </div>
          </div>
        </section>
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
