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
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function formatDueDate(isoString: string, timeZone: string): string {
  const date = new Date(isoString);

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

function formatEventTime(isoString: string, timeZone: string): string {
  const date = new Date(isoString);

  return date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

function formatEventDate(isoString: string, timeZone: string): string {
  const date = new Date(isoString);

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  });
}

function formatPlanItemTime(isoString: string, timeZone: string): string {
  return formatEventTime(isoString, timeZone);
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

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}
    >
      {label}
    </span>
  );
}

function briefingStatusTone(status: string | undefined): string {
  switch (status) {
    case "completed":
      return "border-[rgba(34,197,94,0.35)] text-green-400";
    case "generating":
      return "border-[rgba(59,130,246,0.35)] text-blue-300";
    case "failed":
      return "border-[rgba(248,113,113,0.35)] text-red-400";
    default:
      return "border-[var(--navy-border)] text-[var(--navy-muted)]";
  }
}

function planStatusTone(status: string | undefined): string {
  return briefingStatusTone(status);
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-xl border border-[var(--navy-border)] bg-[var(--navy-surface)] px-4 py-4 transition-colors hover:border-[rgba(59,130,246,0.35)] hover:bg-[#151f33] no-underline"
    >
      <span className="text-2xl font-semibold tabular-nums text-[var(--foreground)]">
        {value}
      </span>
      <span className="text-xs font-medium text-[var(--navy-muted)]">
        {label}
      </span>
    </Link>
  );
}

function Panel({
  title,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  href: string;
  hrefLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-[var(--navy-border)] bg-[var(--navy-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          {title}
        </h2>
        <Link
          href={href}
          className="text-xs font-medium text-[var(--accent)] transition-colors hover:underline"
        >
          {hrefLabel}
        </Link>
      </div>
      {children}
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
    <Panel title="Morning Brief" href="/briefings" hrefLabel="View brief →">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          label={briefingStatusLabel(status)}
          tone={briefingStatusTone(status)}
        />
      </div>

      {status === "generating" ? (
        <p className="text-sm text-[var(--navy-muted)]">
          Jarvis is gathering your schedule, email, tasks, and goals.
        </p>
      ) : null}

      {status === "failed" ? (
        <p className="text-sm text-red-400">
          {briefing?.safeErrorMessage ??
            "Jarvis could not generate the morning brief."}
        </p>
      ) : null}

      {status === "completed" && briefing?.preview ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">
          {briefing.preview}
        </p>
      ) : null}

      {status === "completed" && !briefing?.preview ? (
        <p className="text-sm text-[var(--navy-muted)]">
          Today&apos;s brief is ready. Open Morning Brief for the full briefing.
        </p>
      ) : null}

      {!briefing ? (
        <p className="text-sm text-[var(--navy-muted)]">
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
    <li
      className={`rounded-lg border px-3 py-2.5 text-sm ${
        item.isFixed
          ? "border-[rgba(59,130,246,0.35)] bg-[rgba(59,130,246,0.08)]"
          : "border-[var(--navy-border)] bg-[var(--background)]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium text-[var(--foreground)]">
          {item.title}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${
            item.isFixed
              ? "bg-[rgba(59,130,246,0.15)] text-blue-300"
              : "bg-[rgba(148,163,184,0.12)] text-[var(--navy-muted)]"
          }`}
        >
          {item.isFixed ? "Fixed event" : "Suggested"}
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--navy-muted)]">
        {formatPlanItemTime(item.startTime, timeZone)} –{" "}
        {formatPlanItemTime(item.endTime, timeZone)}
      </p>
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

  return (
    <Panel title="Daily Plan" href="/plans" hrefLabel="View plan →">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          label={planStatusLabel(status)}
          tone={planStatusTone(status)}
        />
      </div>

      {status === "generating" ? (
        <p className="text-sm text-[var(--navy-muted)]">
          Jarvis is building your schedule around calendar, tasks, and goals.
        </p>
      ) : null}

      {status === "failed" ? (
        <p className="text-sm text-red-400">
          {plan?.safeErrorMessage ??
            "Jarvis could not generate the daily plan."}
        </p>
      ) : null}

      {status === "completed" && plan && plan.items.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {plan.items.map((item, index) => (
            <PlanItemRow
              key={`${item.startTime}-${index}`}
              item={item}
              timeZone={timeZone}
            />
          ))}
        </ol>
      ) : null}

      {status === "completed" && plan && plan.items.length === 0 ? (
        <p className="text-sm text-[var(--navy-muted)]">
          Today&apos;s plan has no scheduled items yet.
        </p>
      ) : null}

      {!plan ? (
        <p className="text-sm text-[var(--navy-muted)]">
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
  return (
    <Panel
      title="Upcoming Schedule"
      href="/connections/microsoft"
      hrefLabel="Microsoft connection →"
    >
      {!outlook.connected ? (
        <p className="text-sm text-[var(--navy-muted)]">
          Outlook is not connected. Connect Microsoft to see calendar events
          here.
        </p>
      ) : outlook.events.length === 0 ? (
        <p className="text-sm text-[var(--navy-muted)]">
          No calendar events in the next 24 hours.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {outlook.events.map((event) => (
            <li
              key={event.id}
              className="rounded-lg border border-[var(--navy-border)] bg-[var(--background)] px-3 py-2.5 text-sm"
            >
              <p className="font-medium text-[var(--foreground)]">
                {event.subject}
              </p>
              <p className="mt-1 text-xs text-[var(--navy-muted)]">
                {formatEventDate(event.start, timeZone)}
                {event.isAllDay
                  ? " · All day"
                  : ` · ${formatEventTime(event.start, timeZone)} – ${formatEventTime(event.end, timeZone)}`}
              </p>
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
    <li
      className={`rounded-lg border px-3 py-2.5 text-sm ${
        task.overdue
          ? "border-[rgba(251,191,36,0.35)] bg-[rgba(251,191,36,0.06)]"
          : "border-[var(--navy-border)] bg-[var(--background)]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="font-medium text-[var(--foreground)]">
          {task.title}
        </span>
        <span className="rounded-full border border-[var(--navy-border)] px-2 py-0.5 text-xs capitalize text-[var(--navy-muted)]">
          {task.priority}
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--navy-muted)]">
        {task.dueAt ? (
          <>
            Due {formatDueDate(task.dueAt, timeZone)}
            {task.overdue ? " · Past due" : task.dueToday ? " · Due today" : null}
          </>
        ) : (
          "No due date"
        )}
      </p>
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
    <Panel title="Tasks" href="/tasks" hrefLabel="View all tasks →">
      {tasks.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} timeZone={timeZone} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--navy-muted)]">
          No open tasks. Add tasks from the Tasks page.
        </p>
      )}
    </Panel>
  );
}

function ApprovalsPanel({ approvals }: { approvals: CommandCenterApproval[] }) {
  return (
    <Panel title="Approvals" href="/approvals" hrefLabel="Review all →">
      {approvals.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {approvals.map((approval) => (
            <li
              key={approval.id}
              className="rounded-lg border border-[var(--navy-border)] bg-[var(--background)] px-3 py-2.5 text-sm"
            >
              <p className="font-medium text-[var(--foreground)]">
                {approval.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--navy-muted)]">
                {approval.summary}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--navy-muted)]">
          No pending approvals. Sensitive actions will appear here for review.
        </p>
      )}
    </Panel>
  );
}

function GoalsPanel({ goals }: { goals: CommandCenterGoal[] }) {
  return (
    <Panel title="Goals" href="/assistant" hrefLabel="Ask Jarvis about goals →">
      {goals.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {goals.map((goal) => (
            <li
              key={goal.id}
              className="rounded-lg border border-[var(--navy-border)] bg-[var(--background)] px-3 py-2.5 text-sm"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium text-[var(--foreground)]">
                  {goal.title}
                </span>
                <span className="rounded-full border border-[var(--navy-border)] px-2 py-0.5 text-xs capitalize text-[var(--navy-muted)]">
                  {goal.priority}
                </span>
              </div>
              {goal.lifeAreaName ? (
                <p className="mt-1 text-xs text-[var(--navy-muted)]">
                  {goal.lifeAreaName}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--navy-muted)]">
          No active goals yet. Tell Jarvis about your goals in the assistant.
        </p>
      )}
    </Panel>
  );
}

const LIFE_AREA_MODULES = [
  { name: "Melusi", description: "Relationship module — coming next." },
  { name: "School", description: "Academic module — coming next." },
  { name: "Fitness", description: "Training module — coming next." },
  { name: "Diet", description: "Nutrition module — coming next." },
] as const;

const NAV_LINKS = [
  { href: "/assistant", label: "Ask Jarvis" },
  { href: "/briefings", label: "Morning Brief" },
  { href: "/plans", label: "Daily Plan" },
  { href: "/tasks", label: "Tasks" },
  { href: "/approvals", label: "Approvals" },
  { href: "/connections/microsoft", label: "Microsoft Connection" },
] as const;

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
    <div className="home relative !justify-start !py-8">
      <form action="/auth/signout" method="post" className="absolute top-6 right-6">
        <button
          type="submit"
          className="rounded-lg border border-[var(--navy-border)] bg-[var(--navy-surface)] px-3 py-1.5 text-sm font-medium text-[var(--navy-muted)] transition-colors hover:border-[rgba(148,163,184,0.22)] hover:text-[var(--foreground)]"
        >
          Sign out
        </button>
      </form>

      <main className="home-main !max-w-5xl !items-stretch !gap-8 !px-1">
        <header className="home-header !items-start !text-left w-full">
          <p className="text-sm font-medium text-[var(--navy-muted)]">
            {getGreeting(data.timezone)}, {displayName}
          </p>
          <h1 className="home-title !text-3xl">Command Center</h1>
          <p className="home-subtitle !text-left">{data.todayDateLabel}</p>

          <nav
            className="mt-2 flex w-full flex-wrap gap-2"
            aria-label="Command center navigation"
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg border border-[var(--navy-border)] bg-[var(--navy-surface)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition-colors hover:border-[rgba(59,130,246,0.35)] hover:bg-[#151f33] no-underline"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </header>

        <section
          className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4"
          aria-label="Today's overview"
        >
          <StatCard
            label="Unfinished tasks"
            value={data.counts.unfinishedTasks}
            href="/tasks"
          />
          <StatCard
            label="Overdue tasks"
            value={data.counts.overdueTasks}
            href="/tasks"
          />
          <StatCard
            label="Pending approvals"
            value={data.counts.pendingApprovals}
            href="/approvals"
          />
          <StatCard
            label="Active goals"
            value={data.counts.activeGoals}
            href="/assistant"
          />
        </section>

        <div className="grid w-full gap-4 md:grid-cols-2">
          <BriefingPanel briefing={data.briefing} />
          <PlanPanel plan={data.plan} timeZone={data.timezone} />
        </div>

        <SchedulePanel outlook={data.outlook} timeZone={data.timezone} />

        <div className="grid w-full gap-4 md:grid-cols-2">
          <TasksPanel tasks={data.tasks} timeZone={data.timezone} />
          <ApprovalsPanel approvals={data.approvals} />
        </div>

        <GoalsPanel goals={data.goals} />

        <section className="flex w-full flex-col gap-3" aria-label="Life areas">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[var(--foreground)]">
                Life Areas
              </h2>
              <p className="mt-1 text-xs text-[var(--navy-muted)]">
                Dedicated modules for each part of your life — in development.
              </p>
            </div>
            <Link
              href="/assistant"
              className="text-xs font-medium text-[var(--accent)] transition-colors hover:underline"
            >
              Ask Jarvis across all areas →
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {LIFE_AREA_MODULES.map((module) => (
              <div
                key={module.name}
                className="flex flex-col gap-1 rounded-xl border border-dashed border-[var(--navy-border)] bg-[var(--navy-surface)] px-4 py-4 opacity-80"
                aria-disabled="true"
              >
                <span className="text-sm font-medium text-[var(--foreground)]">
                  {module.name}
                </span>
                <span className="text-xs text-[var(--navy-muted)]">
                  {module.description}
                </span>
              </div>
            ))}
          </div>
        </section>

        <footer className="home-footer w-full">
          <span className="home-status">
            <span className="home-status-dot" aria-hidden="true" />
            Command Center online.
          </span>
        </footer>
      </main>
    </div>
  );
}
