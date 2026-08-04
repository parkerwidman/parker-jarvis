import Link from "next/link";
import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisPageHeader } from "@/components/jarvis/jarvis-page-header";
import {
  JarvisAlert,
  JarvisCard,
  JarvisPageContent,
} from "@/components/jarvis/jarvis-ui";
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
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;

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
    .select("microsoft_user_id, email, display_name, connected_at")
    .eq("user_id", userId)
    .maybeSingle();

  return (
    <JarvisAppShell>
      <JarvisPageContent>
        <JarvisPageHeader
          title="Microsoft Connection"
          subtitle="Connect Jarvis to Outlook and Calendar."
        />

        {connected === "true" ? (
          <JarvisAlert variant="success">
            Microsoft 365 connected successfully.
          </JarvisAlert>
        ) : null}

        {error ? (
          <JarvisAlert variant="error">
            Could not connect Microsoft 365. Please try again.
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
                  <li>Create calendar events after approval</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="jv-connection-disconnected">
              <div className="jv-connection-indicator">
                <span className="jv-status-dot jv-status-dot--offline" aria-hidden="true" />
                <span className="jv-connection-label">Not connected</span>
              </div>
              <p className="jv-connection-meta">
                Connect Microsoft 365 to enable calendar and email integration.
              </p>
              <Link href="/api/microsoft/connect" className="jv-btn jv-btn--primary jv-btn--inline">
                Connect Microsoft 365
              </Link>
            </div>
          )}
        </JarvisCard>
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
