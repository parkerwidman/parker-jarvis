import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisChat } from "@/components/jarvis/jarvis-chat";
import Link from "next/link";
import type { ReactNode } from "react";
import type {
  CommandCenterApproval,
  CommandCenterCalendarEvent,
  CommandCenterGoal,
  CommandCenterPlan,
  CommandCenterPlanItem,
  CommandCenterTask,
} from "@/lib/jarvis/dashboard/load-command-center";
import { loadCommandCenter } from "@/lib/jarvis/dashboard/load-command-center";
import { getLifeAreaModules } from "@/lib/jarvis/life-areas/module-registry";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const PREVIEW_PLAN_ITEMS = 5;
const PREVIEW_SCHEDULE_EVENTS = 5;
const PREVIEW_APPROVALS = 3;
const PREVIEW_BRIEF_LINES = 3;

function formatDueDate(isoString: string, timeZone: string): string {
  const date = new Date(isoString);

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  });
}

function formatEventTime(isoString: string, timeZone: string): string {
  const date = new Date(isoString);

  return date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

function formatPlanItemTime(isoString: string, timeZone: string): string {
  return formatEventTime(isoString, timeZone);
}

function formatTimelineTime(
  isoString: string,
  timeZone: string,
  isAllDay: boolean,
): string {
  if (isAllDay) {
    return "All day";
  }

  const date = new Date(isoString);

  return date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

function formatEventDuration(
  start: string,
  end: string,
  isAllDay: boolean,
): string {
  if (isAllDay) {
    return "All day";
  }

  const durationMinutes = Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / 60000,
  );

  if (durationMinutes < 60) {
    return `${durationMinutes} min`;
  }

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function getGreeting(timeZone: string, now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hour12: false,
    }).format(now),
  );

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 17) {
    return "Good afternoon";
  }

  return "Good evening";
}

function formatHeaderTime(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
}

function briefingStatusLabel(status: string | undefined): string {
  switch (status) {
    case "completed":
      return "Ready";
    case "generating":
      return "Generating";
    case "failed":
      return "Failed";
    default:
      return "Not generated";
  }
}

function planStatusLabel(status: string | undefined): string {
  return briefingStatusLabel(status);
}

function statusBadgeClass(status: string | undefined): string {
  switch (status) {
    case "completed":
      return "cc-badge cc-badge--ready";
    case "generating":
      return "cc-badge cc-badge--generating";
    case "failed":
      return "cc-badge cc-badge--failed";
    default:
      return "cc-badge cc-badge--idle";
  }
}

function truncateBriefPreview(preview: string): string {
  const lines = preview.split("\n").filter((line) => line.trim());

  if (lines.length <= PREVIEW_BRIEF_LINES) {
    return lines.join("\n");
  }

  return `${lines.slice(0, PREVIEW_BRIEF_LINES).join("\n")}…`;
}


function StatIcon({ variant }: { variant: "tasks" | "overdue" | "approvals" | "goals" }) {
  const icons: Record<typeof variant, ReactNode> = {
    tasks: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4.5 7l2 2 3.5-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    overdue: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M7 4v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
    approvals: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <rect x="2" y="3" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4.5 7l1.5 1.5 3.5-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    goals: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="7" cy="7" r="0.75" fill="currentColor" />
      </svg>
    ),
  };

  const iconClass =
    variant === "overdue"
      ? "cc-stat-icon cc-stat-icon--warning"
      : variant === "goals"
        ? "cc-stat-icon cc-stat-icon--goals"
        : variant === "approvals"
          ? "cc-stat-icon cc-stat-icon--review"
          : "cc-stat-icon cc-stat-icon--neutral";

  return <span className={iconClass}>{icons[variant]}</span>;
}

function StatCard({
  label,
  value,
  meta,
  href,
  variant,
  warning,
}: {
  label: string;
  value: number;
  meta: string;
  href: string;
  variant: "tasks" | "overdue" | "approvals" | "goals";
  warning?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`cc-stat${warning && value > 0 ? " cc-stat--warning" : ""}`}
    >
      <StatIcon variant={variant} />
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
  intel,
  accent,
  children,
}: {
  title: string;
  href: string;
  hrefLabel: string;
  intel?: boolean;
  accent?: "blue" | "purple" | "amber" | "green";
  children: ReactNode;
}) {
  const accentClass = accent ? ` cc-card--${accent}` : "";

  return (
    <section className={`cc-card${intel ? " cc-card--intel" : ""}${accentClass}`}>
      <div className="cc-card-header">
        <h2 className="cc-card-title">{title}</h2>
        <Link href={href} className="cc-card-link">
          {hrefLabel}
        </Link>
      </div>
      <div className="cc-card-body">{children}</div>
    </section>
  );
}

function BriefingPanel({
  briefing,
}: {
  briefing: {
    status: string;
    preview: string | null;
    safeErrorMessage: string | null;
  } | null;
}) {
  const status = briefing?.status;

  return (
    <Panel title="Morning Brief" href="/briefings" hrefLabel="View full brief" intel accent="blue">
      <div className="cc-card-meta">
        <span className={statusBadgeClass(status)}>
          {briefingStatusLabel(status)}
        </span>
      </div>

      {status === "generating" ? (
        <p className="cc-empty">Jarvis is gathering your schedule, tasks, and goals.</p>
      ) : null}

      {status === "failed" ? (
        <p className="cc-alert cc-alert--error">
          {briefing?.safeErrorMessage ??
            "Jarvis could not generate the morning brief."}
        </p>
      ) : null}

      {status === "completed" && briefing?.preview ? (
        <p className="cc-brief-preview">
          {truncateBriefPreview(briefing.preview)}
        </p>
      ) : null}

      {status === "completed" && !briefing?.preview ? (
        <p className="cc-empty">
          Today&apos;s brief is ready. Open Morning Brief for the full briefing.
        </p>
      ) : null}

      {!briefing ? (
        <p className="cc-empty">
          No brief for today yet. Generate one from the Morning Brief page.
        </p>
      ) : null}
    </Panel>
  );
}

function PlanItemRow({
  item,
  timeZone,
}: {
  item: CommandCenterPlanItem;
  timeZone: string;
}) {
  return (
    <li className="cc-plan-row">
      <time className="cc-plan-time" dateTime={item.startTime}>
        {formatPlanItemTime(item.startTime, timeZone)}
      </time>
      <div className="cc-plan-content">
        <span className="cc-plan-title">{item.title}</span>
        <span
          className={`cc-type-badge ${
            item.isFixed ? "cc-type-badge--event" : "cc-type-badge--focus"
          }`}
        >
          {item.isFixed ? "Event" : "Focus"}
        </span>
      </div>
    </li>
  );
}

function PlanPanel({
  plan,
  timeZone,
}: {
  plan: CommandCenterPlan | null;
  timeZone: string;
}) {
  const status = plan?.status;
  const previewItems = plan?.items.slice(0, PREVIEW_PLAN_ITEMS) ?? [];

  return (
    <Panel title="Daily Plan" href="/plans" hrefLabel="View full plan" intel accent="purple">
      <div className="cc-card-meta">
        <span className={statusBadgeClass(status)}>
          {planStatusLabel(status)}
        </span>
      </div>

      {status === "generating" ? (
        <p className="cc-empty">
          Jarvis is building your schedule around calendar, tasks, and goals.
        </p>
      ) : null}

      {status === "failed" ? (
        <p className="cc-alert cc-alert--error">
          {plan?.safeErrorMessage ?? "Jarvis could not generate the daily plan."}
        </p>
      ) : null}

      {status === "completed" && previewItems.length > 0 ? (
        <ol className="cc-plan-list">
          {previewItems.map((item, index) => (
            <PlanItemRow
              key={`${item.startTime}-${index}`}
              item={item}
              timeZone={timeZone}
            />
          ))}
        </ol>
      ) : null}

      {status === "completed" && plan && plan.items.length === 0 ? (
        <p className="cc-empty">Today&apos;s plan has no scheduled items yet.</p>
      ) : null}

      {!plan ? (
        <p className="cc-empty">
          No plan for today yet. Generate one from the Daily Plan page.
        </p>
      ) : null}
    </Panel>
  );
}

function SchedulePanel({
  outlook,
  timeZone,
}: {
  outlook: { connected: boolean; events: CommandCenterCalendarEvent[] };
  timeZone: string;
}) {
  const previewEvents = outlook.events.slice(0, PREVIEW_SCHEDULE_EVENTS);

  return (
    <Panel
      title="Upcoming Schedule"
      href="/connections/microsoft"
      hrefLabel="Microsoft connection"
      accent="blue"
    >
      {!outlook.connected ? (
        <p className="cc-empty">
          Outlook is not connected. Connect Microsoft to see calendar events here.
        </p>
      ) : previewEvents.length === 0 ? (
        <p className="cc-empty">No calendar events in the next 24 hours.</p>
      ) : (
        <ul className="cc-schedule-list">
          {previewEvents.map((event) => (
            <li key={event.id} className="cc-schedule-row">
              <time
                className={`cc-schedule-time${event.isAllDay ? " cc-schedule-time--allday" : ""}`}
                dateTime={event.start}
              >
                {formatTimelineTime(event.start, timeZone, event.isAllDay)}
              </time>
              <div className="cc-schedule-details">
                <span className="cc-schedule-title">{event.subject}</span>
                <span className="cc-schedule-duration">
                  {formatEventDuration(event.start, event.end, event.isAllDay)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function TaskRow({
  task,
  timeZone,
}: {
  task: CommandCenterTask;
  timeZone: string;
}) {
  return (
    <li className={`cc-task-row${task.overdue ? " cc-task-row--overdue" : ""}`}>
      <span className="cc-task-check" aria-hidden="true" />
      <div className="cc-task-main">
        <span className="cc-task-title">{task.title}</span>
        <span className="cc-task-due">
          {task.dueAt ? (
            <>
              Due {formatDueDate(task.dueAt, timeZone)}
              {task.overdue ? (
                <span className="cc-task-overdue-label"> · Overdue</span>
              ) : task.dueToday ? (
                " · Today"
              ) : null}
            </>
          ) : (
            "No due date"
          )}
        </span>
      </div>
    </li>
  );
}

function TasksPanel({
  tasks,
  timeZone,
}: {
  tasks: CommandCenterTask[];
  timeZone: string;
}) {
  return (
    <Panel title="My Tasks" href="/tasks" hrefLabel="View all tasks" accent="amber">
      {tasks.length > 0 ? (
        <ul className="cc-task-list">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} timeZone={timeZone} />
          ))}
        </ul>
      ) : (
        <p className="cc-empty">No open tasks. Add tasks from the Tasks page.</p>
      )}
    </Panel>
  );
}

function ApprovalsPanel({ approvals }: { approvals: CommandCenterApproval[] }) {
  const previewApprovals = approvals.slice(0, PREVIEW_APPROVALS);

  return (
    <Panel title="Approvals" href="/approvals" hrefLabel="Review all" accent="amber">
      {previewApprovals.length > 0 ? (
        <ul className="cc-approval-list">
          {previewApprovals.map((approval) => (
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
        <p className="cc-empty">
          No pending approvals. Sensitive actions will appear here for review.
        </p>
      )}
    </Panel>
  );
}

function GoalsPanel({ goals }: { goals: CommandCenterGoal[] }) {
  return (
    <Panel title="Goals" href="/assistant" hrefLabel="Ask Jarvis" accent="green">
      {goals.length > 0 ? (
        <ul className="cc-goal-list">
          {goals.map((goal) => (
            <li key={goal.id} className="cc-goal-row">
              <span className="cc-goal-check" aria-hidden="true">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M2 5.5l2 2 4-4"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div className="cc-goal-main">
                <span className="cc-goal-title">{goal.title}</span>
                {goal.lifeAreaName ? (
                  <span className="cc-goal-area">{goal.lifeAreaName}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cc-empty">
          No active goals yet. Tell Jarvis about your goals in the assistant.
        </p>
      )}
    </Panel>
  );
}

const LIFE_AREA_MODULES = getLifeAreaModules();

function LifeAreaModuleCard({
  module,
}: {
  module: (typeof LIFE_AREA_MODULES)[number];
}) {
  const className = `cc-life-module cc-life-module--${module.key}`;

  if (module.implemented && module.route) {
    return (
      <Link href={module.route} className={`${className} cc-life-module--link`}>
        <span className="cc-life-module-icon" aria-hidden="true" />
        <span className="cc-life-module-name">{module.displayName}</span>
        <span className="cc-life-module-purpose">{module.purpose}</span>
        <span className="cc-life-module-tag cc-life-module-tag--ready">Open module</span>
      </Link>
    );
  }

  return (
    <div className={className} aria-disabled="true">
      <span className="cc-life-module-icon" aria-hidden="true" />
      <span className="cc-life-module-name">{module.displayName}</span>
      <span className="cc-life-module-purpose">{module.purpose}</span>
      <span className="cc-life-module-tag">Coming soon</span>
    </div>
  );
}

export default async function Home() {
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

  const data = await loadCommandCenter(supabase, userId);
  const displayName = data.preferredName ?? "Parker";

  return (
    <JarvisAppShell mainClassName="app-main--command-center">
        <header className="cc-header">
          <div className="cc-header-copy">
            <h1 className="cc-greeting">
              {getGreeting(data.timezone)}, <span>{displayName}.</span>
            </h1>
            <p className="cc-header-sub">
              Here&apos;s what&apos;s happening today.
            </p>
          </div>
          <div className="cc-header-meta">
            <time className="cc-header-date" dateTime={data.todayDate}>
              {data.todayDateLabel}
            </time>
            <span className="cc-header-time">
              {formatHeaderTime(data.timezone)}
            </span>
          </div>
        </header>

        <section className="cc-stat-grid" aria-label="Today's overview">
          <StatCard
            label="Unfinished tasks"
            value={data.counts.unfinishedTasks}
            meta={
              data.counts.overdueTasks > 0
                ? `${data.counts.overdueTasks} overdue`
                : "Open items"
            }
            href="/tasks"
            variant="tasks"
          />
          <StatCard
            label="Overdue tasks"
            value={data.counts.overdueTasks}
            meta={data.counts.overdueTasks > 0 ? "Need attention" : "All caught up"}
            href="/tasks"
            variant="overdue"
            warning
          />
          <StatCard
            label="Pending approvals"
            value={data.counts.pendingApprovals}
            meta={
              data.counts.pendingApprovals > 0
                ? "Require review"
                : "Nothing pending"
            }
            href="/approvals"
            variant="approvals"
          />
          <StatCard
            label="Active goals"
            value={data.counts.activeGoals}
            meta="On track"
            href="/assistant"
            variant="goals"
          />
        </section>

        <JarvisChat variant="embedded" userName={displayName} />

        <div className="cc-dashboard-grid">
          <div className="cc-dashboard-col">
            <BriefingPanel briefing={data.briefing} />
            <SchedulePanel outlook={data.outlook} timeZone={data.timezone} />
          </div>

          <div className="cc-dashboard-col">
            <PlanPanel plan={data.plan} timeZone={data.timezone} />
            <TasksPanel tasks={data.tasks} timeZone={data.timezone} />
          </div>

          <div className="cc-dashboard-col cc-dashboard-col--narrow">
            <ApprovalsPanel approvals={data.approvals} />
            <GoalsPanel goals={data.goals} />
          </div>
        </div>

        <section className="cc-life-section" aria-label="Life areas">
          <div className="cc-life-grid">
            {LIFE_AREA_MODULES.map((module) => (
              <LifeAreaModuleCard key={module.key} module={module} />
            ))}
          </div>
        </section>
    </JarvisAppShell>
  );
}
