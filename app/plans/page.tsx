import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisPageHeader } from "@/components/jarvis/jarvis-page-header";
import type { PlanItem } from "@/lib/jarvis/plans/generate-daily-plan";
import {
  buildDailyPlanItemKey,
  getBlockingRequestStatusForItemKey,
  getDailyPlanItemRequestStatusLabel,
  isProposableSuggestedPlanItem,
} from "@/lib/jarvis/plans/plan-item-calendar";
import {
  JarvisAlert,
  JarvisButton,
  JarvisCard,
  JarvisEmptyState,
  JarvisMarkdownContent,
  JarvisPageContent,
  JarvisSection,
  statusBadgeClass,
} from "@/components/jarvis/jarvis-ui";
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
    <section className="jv-plan-timeline" aria-label="Plan timeline">
      <h3 className="jv-section-label">Timeline</h3>
      <p className="jv-timeline-note">
        Suggested blocks can be proposed for Outlook. Calendar changes require
        your approval before Jarvis creates an event.
      </p>
      <ol className="jv-timeline-list">
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
              className={`jv-timeline-item${item.isFixed ? " jv-timeline-item--fixed" : ""}`}
            >
              <time className="jv-timeline-time" dateTime={item.startTime}>
                {formatPlanItemTime(item.startTime, timeZone)}
              </time>
              <div className="jv-timeline-body">
                <div className="jv-timeline-head">
                  <span className="jv-timeline-title">{item.title}</span>
                  <span
                    className={`jv-type-badge ${
                      item.isFixed ? "jv-type-badge--event" : "jv-type-badge--focus"
                    }`}
                  >
                    {item.isFixed ? "Fixed event" : "Suggested"}
                  </span>
                  <span className="jv-timeline-type">
                    {item.type.replace("_", " ")}
                  </span>
                </div>
                <p className="jv-timeline-range">
                  {formatPlanItemTime(item.startTime, timeZone)} –{" "}
                  {formatPlanItemTime(item.endTime, timeZone)}
                </p>
                {item.reason ? (
                  <p className="jv-timeline-reason">{item.reason}</p>
                ) : null}
                {!item.isFixed && canPropose && !requestStatus ? (
                  <form
                    action={proposeDailyPlanItemForCalendarAction}
                    className="jv-timeline-action"
                  >
                    <input type="hidden" name="dailyPlanId" value={planId} />
                    <input type="hidden" name="itemIndex" value={index} />
                    <JarvisButton type="submit" variant="secondary">
                      Propose for calendar
                    </JarvisButton>
                  </form>
                ) : null}
                {!item.isFixed && requestStatus ? (
                  <p className="jv-timeline-status">
                    {getDailyPlanItemRequestStatusLabel(requestStatus)}
                  </p>
                ) : null}
              </div>
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
    <JarvisAppShell>
      <JarvisPageContent className="jv-page-content--scroll">
        <JarvisPageHeader
          title="Daily Plan"
          subtitle="An advisory schedule for your day. Calendar changes require your approval before Jarvis modifies Outlook."
        />

        {generated === "1" ? (
          <JarvisAlert variant="success">Daily plan generated.</JarvisAlert>
        ) : null}

        {queryError === "1" ? (
          <JarvisAlert variant="error">
            Jarvis could not generate the daily plan.
          </JarvisAlert>
        ) : null}

        <div className="jv-action-row">
          <form action={generateDailyPlanAction} className="jv-action-form">
            <JarvisButton type="submit" className="jv-btn--block">
              {hasTodayPlan ? "Regenerate daily plan" : "Generate daily plan"}
            </JarvisButton>
          </form>
          {todayPlan ? (
            <span className={statusBadgeClass(todayPlan.status)}>
              {planStatusLabel(todayPlan.status)}
            </span>
          ) : null}
        </div>

        {todayPlan?.status === "generating" ? (
          <JarvisCard accent="purple">
            <p className="jv-status-message">Generating today&apos;s plan…</p>
            <p className="jv-status-detail">
              Jarvis is building your schedule around calendar, tasks, and goals.
            </p>
          </JarvisCard>
        ) : null}

        {todayPlan?.status === "failed" ? (
          <JarvisAlert variant="error">
            {todayPlan.safe_error_message ??
              "Jarvis could not generate the daily plan."}
          </JarvisAlert>
        ) : null}

        {featuredPlan?.content ? (
          <JarvisCard title="Current plan" accent="purple" scroll>
            <div className="jv-meta-row">
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
            <JarvisMarkdownContent content={featuredPlan.content} />
            <PlanTimeline
              planId={featuredPlan.id}
              items={featuredPlan.plan_items ?? []}
              timeZone={featuredPlan.timezone}
              calendarRequests={calendarRequests ?? []}
            />
          </JarvisCard>
        ) : todayPlan?.status !== "generating" ? (
          <JarvisEmptyState
            title="No plan yet"
            description="Generate your first daily plan to see a suggested schedule for today."
          />
        ) : null}

        {historyRows.length > 0 ? (
          <JarvisSection title="Earlier plans">
            <ul className="jv-history-list">
              {historyRows.map((row) => (
                <li key={row.id} className="jv-history-item">
                  {formatPlanDate(row.plan_date)}
                  {row.generated_at ? (
                    <span className="jv-history-meta">
                      · {formatGeneratedAt(row.generated_at, row.timezone)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </JarvisSection>
        ) : null}
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
