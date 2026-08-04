import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisPageHeader } from "@/components/jarvis/jarvis-page-header";
import { parseDailyPlanCalendarPayload } from "@/lib/jarvis/plans/plan-item-calendar";
import {
  approvalStatusBadgeClass,
  JarvisAlert,
  JarvisButton,
  JarvisCard,
  JarvisEmptyState,
  JarvisPageContent,
} from "@/components/jarvis/jarvis-ui";
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

function formatCalendarDateTime(isoString: string, timeZone: string): string {
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
  const pendingCount = sortedRequests.filter((r) => r.status === "pending").length;

  return (
    <JarvisAppShell>
      <JarvisPageContent className="jv-page-content--scroll">
        <JarvisPageHeader
          title="Approvals"
          subtitle="Review actions before Jarvis performs them."
          meta={
            pendingCount > 0 ? (
              <span className="jv-badge jv-badge--review">
                {pendingCount} pending
              </span>
            ) : null
          }
        />

        {proposed === "1" ? (
          <JarvisAlert variant="success">
            Calendar proposal submitted for approval.
          </JarvisAlert>
        ) : null}

        {queryError === "duplicate" ? (
          <JarvisAlert variant="error">
            This Daily Plan block already has a pending or scheduled calendar
            request.
          </JarvisAlert>
        ) : null}

        {queryError === "invalid" ? (
          <JarvisAlert variant="error">
            That Daily Plan block could not be proposed for calendar.
          </JarvisAlert>
        ) : null}

        {queryError === "failed" ? (
          <JarvisAlert variant="error">
            The calendar proposal could not be created. Please try again.
          </JarvisAlert>
        ) : null}

        <section className="jv-approval-list" aria-label="Approval requests">
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
                <JarvisCard
                  key={request.id}
                  accent={request.status === "pending" ? "amber" : "none"}
                  className={`jv-approval-card jv-approval-card--${request.status}`}
                >
                  <div className="jv-approval-header">
                    <div className="jv-approval-copy">
                      <h2 className="jv-approval-title">{request.title}</h2>
                      <p className="jv-approval-summary">{request.summary}</p>
                    </div>
                    <div className="jv-approval-badges">
                      <span className="jv-priority-badge">
                        {request.risk_level.replace(/_/g, " ")}
                      </span>
                      <span className={approvalStatusBadgeClass(request.status)}>
                        {statusLabel(request.status)}
                      </span>
                    </div>
                  </div>

                  <div className="jv-meta-row">
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
                    <div className="jv-approval-detail">
                      {isDailyPlanRequest ? (
                        <p className="jv-approval-source">From Daily Plan</p>
                      ) : null}
                      <p className="jv-approval-detail-title">
                        {calendarPayload.subject}
                      </p>
                      <p className="jv-approval-detail-meta">
                        {formatCalendarDateTime(
                          calendarPayload.startDateTime,
                          eventTimeZone,
                        )}
                      </p>
                      <p className="jv-approval-detail-meta">
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
                        <p className="jv-approval-detail-reason">
                          {calendarPayload.reason}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {request.status === "pending" ? (
                    <div className="jv-approval-actions">
                      <form action={approveActionRequest}>
                        <input
                          type="hidden"
                          name="actionRequestId"
                          value={request.id}
                        />
                        <JarvisButton type="submit">Approve</JarvisButton>
                      </form>
                      <form action={rejectActionRequest}>
                        <input
                          type="hidden"
                          name="actionRequestId"
                          value={request.id}
                        />
                        <JarvisButton type="submit" variant="secondary">
                          Reject
                        </JarvisButton>
                      </form>
                    </div>
                  ) : null}

                  {request.status === "completed" && calendarResult ? (
                    <div className="jv-approval-result jv-approval-result--success">
                      <p className="jv-approval-result-title">Completed</p>
                      {calendarResult.subject ? (
                        <p>{calendarResult.subject}</p>
                      ) : null}
                      {calendarResult.start && calendarResult.end ? (
                        <p className="jv-approval-detail-meta">
                          {calendarResult.start} to {calendarResult.end} UTC
                        </p>
                      ) : null}
                      {calendarResult.webLink ? (
                        <a
                          href={calendarResult.webLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="jv-link"
                        >
                          Open in Outlook
                        </a>
                      ) : null}
                    </div>
                  ) : null}

                  {request.status === "failed" && request.safe_error_message ? (
                    <JarvisAlert variant="error">
                      {request.safe_error_message}
                    </JarvisAlert>
                  ) : null}

                  {request.status === "rejected" ? (
                    <p className="jv-approval-note">
                      This request was rejected and will not be executed.
                    </p>
                  ) : null}

                  {request.status === "expired" ? (
                    <p className="jv-approval-note">
                      This request expired before it was approved.
                    </p>
                  ) : null}
                </JarvisCard>
              );
            })
          ) : (
            <JarvisEmptyState
              title="No approval requests"
              description="When Jarvis proposes a sensitive action, it will appear here."
            />
          )}
        </section>
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
