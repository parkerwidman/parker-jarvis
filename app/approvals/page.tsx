import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisPageHeader } from "@/components/jarvis/jarvis-page-header";
import { buildRegisteredActionPreview } from "@/lib/jarvis/action-requests/action-executor-registry";
import { formatLocalDateTime } from "@/lib/jarvis/action-requests/calendar-action-payload";
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

function compareActionRequests(a: ActionRequestRow, b: ActionRequestRow): number {
  const aPending = a.status === "pending";
  const bPending = b.status === "pending";

  if (aPending !== bPending) {
    return aPending ? -1 : 1;
  }

  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
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

function formatCalendarPreviewValue(
  fieldLabel: string,
  value: string,
  timeZone: string | null,
): string {
  if (
    timeZone &&
    (fieldLabel === "Start" || fieldLabel === "End") &&
    !Number.isNaN(new Date(value).getTime())
  ) {
    return formatLocalDateTime(value, timeZone);
  }

  return value;
}

function parseSafeResult(result: unknown): Record<string, string | null> | null {
  if (typeof result !== "object" || result === null) {
    return null;
  }

  const record = result as Record<string, unknown>;
  const safe: Record<string, string | null> = {};

  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase().includes("id")) {
      continue;
    }

    if (typeof value === "string") {
      safe[key] = value;
    } else if (value === null) {
      safe[key] = null;
    }
  }

  return Object.keys(safe).length > 0 ? safe : null;
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
              const preview = buildRegisteredActionPreview(
                request.action_type,
                request.payload,
              );

              const timeZoneField = preview?.fields.find(
                (field) => field.label === "Timezone",
              );
              const eventTimeZone = timeZoneField?.value ?? null;
              const safeResult =
                request.status === "completed"
                  ? parseSafeResult(request.result)
                  : null;

              const isExpiredPending =
                request.status === "pending" &&
                typeof request.expires_at === "string" &&
                new Date(request.expires_at).getTime() <= Date.now();

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
                      <span>
                        {isExpiredPending ? "Expired" : "Expires"}{" "}
                        {formatTimestamp(request.expires_at)}
                      </span>
                    ) : null}
                  </div>

                  {preview ? (
                    <div className="jv-approval-detail">
                      <p className="jv-approval-detail-title">
                        {preview.actionLabel}
                      </p>
                      {preview.sourceLabel ? (
                        <p className="jv-approval-source">{preview.sourceLabel}</p>
                      ) : null}
                      {preview.fields.map((field) => (
                        <p key={field.label} className="jv-approval-detail-meta">
                          <strong>{field.label}:</strong>{" "}
                          {formatCalendarPreviewValue(
                            field.label,
                            field.value,
                            eventTimeZone,
                          )}
                        </p>
                      ))}
                      {preview.reason ? (
                        <p className="jv-approval-detail-reason">
                          {preview.reason}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {request.status === "pending" && !isExpiredPending ? (
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

                  {request.status === "completed" && safeResult ? (
                    <div className="jv-approval-result jv-approval-result--success">
                      <p className="jv-approval-result-title">Completed</p>
                      {safeResult.title ? <p>{safeResult.title}</p> : null}
                      {safeResult.subject ? <p>{safeResult.subject}</p> : null}
                      {safeResult.dueDate ? (
                        <p className="jv-approval-detail-meta">
                          Due {safeResult.dueDate}
                        </p>
                      ) : null}
                      {safeResult.start && safeResult.end ? (
                        <p className="jv-approval-detail-meta">
                          {safeResult.start} to {safeResult.end} UTC
                        </p>
                      ) : null}
                      {safeResult.webLink ? (
                        <a
                          href={safeResult.webLink}
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

                  {request.status === "expired" || isExpiredPending ? (
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
