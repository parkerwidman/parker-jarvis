import Link from "next/link";
import {
  parseDailyPlanCalendarPayload,
} from "@/lib/jarvis/plans/plan-item-calendar";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { approveActionRequest, rejectActionRequest } from "./actions";

type ActionRequestRow = {
  id: string;
  action_type: string;
  status: string;
  risk_level: string;
  title: string;
  summary: string;
  payload: unknown;
  expires_at: string | null;
  created_at: string;
  result: unknown;
  safe_error_message: string | null;
};

type CalendarEventResult = {
  eventId?: string;
  subject?: string;
  start?: string;
  end?: string;
  webLink?: string | null;
};

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCalendarDateTime(
  isoString: string,
  timeZone: string,
): string {
  const date = new Date(isoString);

  return date.toLocaleString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

function formatCalendarTime(isoString: string, timeZone: string): string {
  const date = new Date(isoString);

  return date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

function compareActionRequests(a: ActionRequestRow, b: ActionRequestRow): number {
  const aPending = a.status === "pending";
  const bPending = b.status === "pending";

  if (aPending !== bPending) {
    return aPending ? -1 : 1;
  }

  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function parseCalendarResult(result: unknown): CalendarEventResult | null {
  if (typeof result !== "object" || result === null) {
    return null;
  }

  return result as CalendarEventResult;
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Pending approval";
    case "executing":
      return "Executing";
    case "completed":
      return "Completed";
    case "rejected":
      return "Rejected";
    case "failed":
      return "Failed";
    case "expired":
      return "Expired";
    default:
      return status;
  }
}

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{
    proposed?: string;
    error?: string;
  }>;
}) {
  const { proposed, error: queryError } = await searchParams;

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

  const { data: actionRequests } = await supabase
    .from("action_requests")
    .select(
      "id, action_type, status, risk_level, title, summary, payload, expires_at, created_at, result, safe_error_message",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const sortedRequests = [...(actionRequests ?? [])].sort(compareActionRequests);

  return (
    <div className="home">
      <main className="home-main">
        <header className="home-header">
          <h1 className="home-title">Approvals</h1>
          <p className="home-subtitle">
            Review actions before Jarvis performs them.
          </p>
        </header>

        {proposed === "1" ? (
          <p className="w-full rounded-lg border border-[rgba(34,197,94,0.25)] bg-[rgba(34,197,94,0.08)] px-4 py-3 text-sm text-green-400">
            Calendar proposal submitted for approval.
          </p>
        ) : null}

        {queryError === "duplicate" ? (
          <p className="w-full rounded-lg border border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.08)] px-4 py-3 text-sm text-red-400">
            This Daily Plan block already has a pending or scheduled calendar
            request.
          </p>
        ) : null}

        {queryError === "invalid" ? (
          <p className="w-full rounded-lg border border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.08)] px-4 py-3 text-sm text-red-400">
            That Daily Plan block could not be proposed for calendar.
          </p>
        ) : null}

        {queryError === "failed" ? (
          <p className="w-full rounded-lg border border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.08)] px-4 py-3 text-sm text-red-400">
            The calendar proposal could not be created. Please try again.
          </p>
        ) : null}

        <section className="flex w-full flex-col gap-3" aria-label="Approval requests">
          {sortedRequests.length > 0 ? (
            sortedRequests.map((request) => {
              const calendarResult =
                request.status === "completed" &&
                request.action_type === "create_outlook_calendar_event"
                  ? parseCalendarResult(request.result)
                  : null;

              const calendarPayload =
                request.action_type === "create_outlook_calendar_event"
                  ? parseDailyPlanCalendarPayload(request.payload)
                  : null;

              const isDailyPlanRequest =
                calendarPayload?.source === "daily_plan" &&
                typeof calendarPayload.dailyPlanId === "string";

              const eventTimeZone =
                typeof calendarPayload?.timeZone === "string"
                  ? calendarPayload.timeZone
                  : null;

              return (
                <article
                  key={request.id}
                  className="flex w-full flex-col gap-3 rounded-xl border border-[var(--navy-border)] bg-[var(--navy-surface)] px-5 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-sm font-medium text-[var(--foreground)]">
                        {request.title}
                      </h2>
                      <p className="mt-1 text-sm text-[var(--navy-muted)]">
                        {request.summary}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[var(--navy-border)] px-2.5 py-0.5 text-xs font-medium capitalize text-[var(--navy-muted)]">
                        {request.risk_level.replace(/_/g, " ")}
                      </span>
                      <span className="rounded-full border border-[var(--navy-border)] px-2.5 py-0.5 text-xs font-medium text-[var(--navy-muted)]">
                        {statusLabel(request.status)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--navy-muted)]">
                    <span>Created {formatTimestamp(request.created_at)}</span>
                    {request.expires_at ? (
                      <span>Expires {formatTimestamp(request.expires_at)}</span>
                    ) : null}
                  </div>

                  {calendarPayload &&
                  typeof calendarPayload.subject === "string" &&
                  typeof calendarPayload.startDateTime === "string" &&
                  typeof calendarPayload.endDateTime === "string" &&
                  eventTimeZone ? (
                    <div className="rounded-lg border border-[var(--navy-border)] bg-[var(--background)] px-4 py-3 text-sm">
                      {isDailyPlanRequest ? (
                        <p className="text-xs font-medium text-[var(--accent)]">
                          From Daily Plan
                        </p>
                      ) : null}
                      <p className="mt-1 font-medium text-[var(--foreground)]">
                        {calendarPayload.subject}
                      </p>
                      <p className="mt-1 text-xs text-[var(--navy-muted)]">
                        {formatCalendarDateTime(
                          calendarPayload.startDateTime,
                          eventTimeZone,
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--navy-muted)]">
                        {formatCalendarTime(
                          calendarPayload.startDateTime,
                          eventTimeZone,
                        )}{" "}
                        to{" "}
                        {formatCalendarTime(
                          calendarPayload.endDateTime,
                          eventTimeZone,
                        )}{" "}
                        ({eventTimeZone})
                      </p>
                      {typeof calendarPayload.reason === "string" &&
                      calendarPayload.reason.trim().length > 0 ? (
                        <p className="mt-2 text-xs text-[var(--foreground)]">
                          {calendarPayload.reason}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {request.status === "pending" ? (
                    <div className="flex flex-wrap gap-2">
                      <form action={approveActionRequest}>
                        <input
                          type="hidden"
                          name="actionRequestId"
                          value={request.id}
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                        >
                          Approve
                        </button>
                      </form>
                      <form action={rejectActionRequest}>
                        <input
                          type="hidden"
                          name="actionRequestId"
                          value={request.id}
                        />
                        <button
                          type="submit"
                          className="rounded-lg border border-[var(--navy-border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--background)]"
                        >
                          Reject
                        </button>
                      </form>
                    </div>
                  ) : null}

                  {request.status === "completed" && calendarResult ? (
                    <div className="rounded-lg border border-[rgba(34,197,94,0.25)] bg-[rgba(34,197,94,0.08)] px-4 py-3 text-sm text-green-400">
                      <p className="font-medium">Completed</p>
                      {calendarResult.subject ? (
                        <p className="mt-1 text-[var(--foreground)]">
                          {calendarResult.subject}
                        </p>
                      ) : null}
                      {calendarResult.start && calendarResult.end ? (
                        <p className="mt-1 text-xs text-[var(--navy-muted)]">
                          {calendarResult.start} to {calendarResult.end} UTC
                        </p>
                      ) : null}
                      {calendarResult.webLink ? (
                        <a
                          href={calendarResult.webLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-block text-xs font-medium text-[var(--accent)] hover:underline"
                        >
                          Open in Outlook
                        </a>
                      ) : null}
                    </div>
                  ) : null}

                  {request.status === "failed" && request.safe_error_message ? (
                    <p className="rounded-lg border border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.08)] px-4 py-3 text-sm text-red-400">
                      {request.safe_error_message}
                    </p>
                  ) : null}

                  {request.status === "rejected" ? (
                    <p className="text-xs font-medium text-[var(--navy-muted)]">
                      This request was rejected and will not be executed.
                    </p>
                  ) : null}

                  {request.status === "expired" ? (
                    <p className="text-xs font-medium text-[var(--navy-muted)]">
                      This request expired before it was approved.
                    </p>
                  ) : null}
                </article>
              );
            })
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--navy-border)] bg-[var(--navy-surface)] px-5 py-10 text-center">
              <p className="text-sm font-medium text-[var(--foreground)]">
                No approval requests
              </p>
              <p className="mt-1.5 text-sm text-[var(--navy-muted)]">
                When Jarvis proposes a sensitive action, it will appear here.
              </p>
            </div>
          )}
        </section>

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
