import Link from "next/link";
import type { PlanItem } from "@/lib/jarvis/plans/generate-daily-plan";
import {
  buildDailyPlanItemKey,
  getBlockingRequestStatusForItemKey,
  getDailyPlanItemRequestStatusLabel,
  isProposableSuggestedPlanItem,
} from "@/lib/jarvis/plans/plan-item-calendar";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  generateDailyPlanAction,
  proposeDailyPlanItemForCalendarAction,
} from "./actions";

type DailyPlanRow = {
  id: string;
  plan_date: string;
  timezone: string;
  status: string;
  content: string | null;
  plan_items: PlanItem[] | null;
  safe_error_message: string | null;
  generated_at: string | null;
};

function formatPlanDate(dateString: string): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatGeneratedAt(isoString: string, timeZone: string): string {
  const date = new Date(isoString);

  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

function formatPlanItemTime(isoString: string, timeZone: string): string {
  const date = new Date(isoString);

  return date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

function getLocalDateString(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parsePlanItems(raw: unknown): PlanItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(
    (item): item is PlanItem =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as PlanItem).startTime === "string" &&
      typeof (item as PlanItem).title === "string",
  );
}

function PlanContent({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--foreground)]">
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (trimmed.startsWith("# ")) {
          return (
            <h2
              key={index}
              className="mt-2 text-lg font-semibold text-[var(--foreground)] first:mt-0"
            >
              {trimmed.slice(2)}
            </h2>
          );
        }

        if (trimmed.startsWith("## ")) {
          return (
            <h3
              key={index}
              className="mt-4 text-base font-medium text-[var(--foreground)]"
            >
              {trimmed.slice(3)}
            </h3>
          );
        }

        if (trimmed.startsWith("### ")) {
          return (
            <h4
              key={index}
              className="mt-3 text-sm font-medium text-[var(--foreground)]"
            >
              {trimmed.slice(4)}
            </h4>
          );
        }

        if (trimmed.length === 0) {
          return <div key={index} className="h-2" aria-hidden="true" />;
        }

        return (
          <p key={index} className="whitespace-pre-wrap text-[var(--foreground)]">
            {line}
          </p>
        );
      })}
    </div>
  );
}

function PlanTimeline({
  planId,
  items,
  timeZone,
  calendarRequests,
}: {
  planId: string;
  items: PlanItem[];
  timeZone: string;
  calendarRequests: Array<{ status: string; payload: unknown }>;
}) {
  if (items.length === 0) {
    return null;
  }

  const now = new Date();

  return (
    <section className="flex w-full flex-col gap-2" aria-label="Plan timeline">
      <h3 className="text-sm font-medium text-[var(--navy-muted)]">Timeline</h3>
      <p className="text-xs text-[var(--navy-muted)]">
        Suggested blocks can be proposed for Outlook. Calendar changes require
        your approval before Jarvis creates an event.
      </p>
      <ol className="flex w-full flex-col gap-2">
        {items.map((item, index) => {
          const itemKey = buildDailyPlanItemKey(planId, item);
          const canPropose = isProposableSuggestedPlanItem(item, now);
          const requestStatus = getBlockingRequestStatusForItemKey(
            itemKey,
            calendarRequests,
          );

          return (
            <li
              key={`${item.startTime}-${index}`}
              className={`rounded-lg border px-4 py-3 text-sm ${
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
                <span className="text-xs text-[var(--navy-muted)]">
                  {item.type.replace("_", " ")}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--navy-muted)]">
                {formatPlanItemTime(item.startTime, timeZone)} –{" "}
                {formatPlanItemTime(item.endTime, timeZone)}
              </p>
              {item.reason ? (
                <p className="mt-1.5 text-xs text-[var(--foreground)]">
                  {item.reason}
                </p>
              ) : null}
              {!item.isFixed && canPropose && !requestStatus ? (
                <form
                  action={proposeDailyPlanItemForCalendarAction}
                  className="mt-2"
                >
                  <input type="hidden" name="dailyPlanId" value={planId} />
                  <input type="hidden" name="itemIndex" value={index} />
                  <button
                    type="submit"
                    className="rounded-lg border border-[var(--navy-border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--navy-surface)]"
                  >
                    Propose for calendar
                  </button>
                </form>
              ) : null}
              {!item.isFixed && requestStatus ? (
                <p className="mt-2 text-xs font-medium text-[var(--navy-muted)]">
                  {getDailyPlanItemRequestStatusLabel(requestStatus)}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ generated?: string; error?: string }>;
}) {
  const { generated, error: queryError } = await searchParams;

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

  const { data: profile } = await supabase
    .from("jarvis_profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();

  const displayTimeZone = profile?.timezone?.trim() || "America/Chicago";
  const todayDate = getLocalDateString(displayTimeZone);

  const { data: plans } = await supabase
    .from("daily_plans")
    .select(
      "id, plan_date, timezone, status, content, plan_items, safe_error_message, generated_at",
    )
    .eq("user_id", userId)
    .order("plan_date", { ascending: false })
    .limit(14);

  const { data: calendarRequests } = await supabase
    .from("action_requests")
    .select("status, payload")
    .eq("user_id", userId)
    .eq("action_type", "create_outlook_calendar_event");

  const rows = (plans ?? []).map((row) => ({
    ...(row as DailyPlanRow),
    plan_items: parsePlanItems((row as DailyPlanRow).plan_items),
  }));

  const todayPlan = rows.find((row) => row.plan_date === todayDate);
  const featuredPlan =
    todayPlan?.status === "completed"
      ? todayPlan
      : rows.find((row) => row.status === "completed");

  const historyRows = rows.filter(
    (row) =>
      row.plan_date !== featuredPlan?.plan_date && row.status === "completed",
  );

  const hasTodayPlan = todayPlan !== undefined;

  return (
    <div className="home">
      <main className="home-main">
        <header className="home-header">
          <h1 className="home-title">Daily Plan</h1>
          <p className="home-subtitle">
            An advisory schedule for your day. Calendar changes require your
            approval before Jarvis modifies Outlook.
          </p>
        </header>

        {generated === "1" ? (
          <p className="w-full rounded-lg border border-[rgba(34,197,94,0.25)] bg-[rgba(34,197,94,0.08)] px-4 py-3 text-sm text-green-400">
            Daily plan generated.
          </p>
        ) : null}

        {queryError === "1" ? (
          <p className="w-full rounded-lg border border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.08)] px-4 py-3 text-sm text-red-400">
            Jarvis could not generate the daily plan.
          </p>
        ) : null}

        <form action={generateDailyPlanAction} className="w-full">
          <button
            type="submit"
            className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            {hasTodayPlan ? "Regenerate daily plan" : "Generate daily plan"}
          </button>
        </form>

        {todayPlan?.status === "generating" ? (
          <div className="w-full rounded-xl border border-[var(--navy-border)] bg-[var(--navy-surface)] px-5 py-8 text-center">
            <p className="text-sm font-medium text-[var(--foreground)]">
              Generating today&apos;s plan…
            </p>
            <p className="mt-1.5 text-sm text-[var(--navy-muted)]">
              Jarvis is building your schedule around calendar, tasks, and
              goals.
            </p>
          </div>
        ) : null}

        {todayPlan?.status === "failed" ? (
          <p className="w-full rounded-lg border border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.08)] px-4 py-3 text-sm text-red-400">
            {todayPlan.safe_error_message ??
              "Jarvis could not generate the daily plan."}
          </p>
        ) : null}

        {featuredPlan?.content ? (
          <article className="flex w-full flex-col gap-4 rounded-xl border border-[var(--navy-border)] bg-[var(--navy-surface)] px-5 py-5">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--navy-muted)]">
              <span>{formatPlanDate(featuredPlan.plan_date)}</span>
              {featuredPlan.generated_at ? (
                <span>
                  Generated{" "}
                  {formatGeneratedAt(
                    featuredPlan.generated_at,
                    featuredPlan.timezone,
                  )}
                </span>
              ) : null}
              <span>Timezone: {featuredPlan.timezone}</span>
            </div>
            <PlanContent content={featuredPlan.content} />
            <PlanTimeline
              planId={featuredPlan.id}
              items={featuredPlan.plan_items ?? []}
              timeZone={featuredPlan.timezone}
              calendarRequests={calendarRequests ?? []}
            />
          </article>
        ) : todayPlan?.status !== "generating" ? (
          <div className="w-full rounded-xl border border-dashed border-[var(--navy-border)] bg-[var(--navy-surface)] px-5 py-10 text-center">
            <p className="text-sm font-medium text-[var(--foreground)]">
              No plan yet
            </p>
            <p className="mt-1.5 text-sm text-[var(--navy-muted)]">
              Generate your first daily plan to see a suggested schedule for
              today.
            </p>
          </div>
        ) : null}

        {historyRows.length > 0 ? (
          <section
            className="flex w-full flex-col gap-2"
            aria-label="Plan history"
          >
            <h2 className="text-sm font-medium text-[var(--navy-muted)]">
              Earlier plans
            </h2>
            <ul className="flex w-full flex-col gap-2">
              {historyRows.map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-[var(--navy-border)] bg-[var(--navy-surface)] px-4 py-3 text-sm text-[var(--foreground)]"
                >
                  {formatPlanDate(row.plan_date)}
                  {row.generated_at ? (
                    <span className="ml-2 text-xs text-[var(--navy-muted)]">
                      · {formatGeneratedAt(row.generated_at, row.timezone)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Link
          href="/"
          className="text-sm font-medium text-[var(--navy-muted)] transition-colors hover:text-[var(--foreground)]"
        >
          ← Back to home
        </Link>
      </main>
    </div>
  );
}
