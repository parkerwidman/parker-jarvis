import Link from "next/link";
import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisPageHeader } from "@/components/jarvis/jarvis-page-header";
import {
  JarvisAlert,
  JarvisCard,
  JarvisPageContent,
} from "@/components/jarvis/jarvis-ui";
import { resolveMailSendPermissionState } from "@/lib/microsoft/scopes";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function formatConnectionDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function MicrosoftConnectionPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; result?: string }>;
}) {
  const { connected, error, result } = await searchParams;

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

  const { data: connection } = await supabase
    .from("microsoft_connections")
    .select("microsoft_user_id, email, display_name, connected_at, granted_scopes")
    .eq("user_id", userId)
    .maybeSingle();

  const mailSendState = connection
    ? resolveMailSendPermissionState(connection.granted_scopes)
    : null;
  const hasMailSend = mailSendState === "granted";
  const mailSendUnknown = mailSendState === "unknown";

  return (
    <JarvisAppShell>
      <JarvisPageContent>
        <JarvisPageHeader
          title="Microsoft Connection"
          subtitle="Connect Jarvis to Outlook and Calendar."
        />

        {connected === "true" || result === "microsoft_connected" ? (
          <JarvisAlert variant="success">
            Microsoft 365 connected successfully.
          </JarvisAlert>
        ) : null}

        {result === "microsoft_reconnected" ? (
          <JarvisAlert variant="success">
            Microsoft permissions updated.
          </JarvisAlert>
        ) : null}

        {result === "microsoft_reconnected_mail_send_missing" ? (
          <JarvisAlert variant="error">
            Microsoft reconnected, but email sending permission was not granted.
            Your existing connection is still available.
          </JarvisAlert>
        ) : null}

        {result === "microsoft_reconnected_mail_send_unknown" ? (
          <JarvisAlert variant="success">
            Microsoft reconnected. Email permission will be verified when Jarvis
            sends your next email.
          </JarvisAlert>
        ) : null}

        {result === "microsoft_consent_cancelled" ? (
          <JarvisAlert variant="error">
            Microsoft reconnection was cancelled. Your existing connection is still
            available.
          </JarvisAlert>
        ) : null}

        {result === "microsoft_connection_failed" ||
        result === "invalid_oauth_state" ||
        error ? (
          <JarvisAlert variant="error">
            {connection
              ? "Could not update Microsoft permissions. Your existing connection is still available."
              : "Could not connect Microsoft 365. Please try again."}
          </JarvisAlert>
        ) : null}

        <JarvisCard title="Connection status" accent="blue">
          {connection ? (
            <div className="jv-connection-status">
              <div className="jv-connection-indicator">
                <span className="jv-status-dot" aria-hidden="true" />
                <span className="jv-connection-label">Connected</span>
              </div>

              {connection.display_name ? (
                <p className="jv-connection-name">{connection.display_name}</p>
              ) : null}

              {connection.email ? (
                <p className="jv-connection-email">{connection.email}</p>
              ) : null}

              {connection.connected_at ? (
                <p className="jv-connection-meta">
                  Connected on {formatConnectionDate(connection.connected_at)}
                </p>
              ) : null}

              <div className="jv-capabilities">
                <h3 className="jv-section-label">Granted capabilities</h3>
                <ul className="jv-capability-list">
                  <li>Read Outlook calendar events</li>
                  <li>Create Outlook calendar events</li>
                  <li>Create Outlook email drafts</li>
                  {hasMailSend ? <li>Send Outlook email when requested</li> : null}
                  {mailSendUnknown ? (
                    <li>Send Outlook email when requested (permission pending verification)</li>
                  ) : null}
                </ul>
              </div>

              <div className="jv-connection-actions">
                <p className="jv-connection-meta">
                  Reconnect Microsoft when Jarvis adds new permissions, such as email
                  sending. Reconnecting starts a fresh authorization and does not remove
                  your current connection unless the update succeeds.
                </p>
                <Link
                  href="/api/microsoft/connect?mode=reconnect"
                  className="jv-btn jv-btn--primary jv-btn--inline"
                >
                  Reconnect Microsoft
                </Link>
              </div>
            </div>
          ) : (
            <div className="jv-connection-disconnected">
              <div className="jv-connection-indicator">
                <span
                  className="jv-status-dot jv-status-dot--offline"
                  aria-hidden="true"
                />
                <span className="jv-connection-label">Not connected</span>
              </div>
              <p className="jv-connection-meta">
                Connect Microsoft 365 to enable calendar and email integration.
              </p>
              <Link
                href="/api/microsoft/connect"
                className="jv-btn jv-btn--primary jv-btn--inline"
              >
                Connect Microsoft 365
              </Link>
            </div>
          )}
        </JarvisCard>
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
