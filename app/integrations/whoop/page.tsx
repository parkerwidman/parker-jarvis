import Link from "next/link";
import { redirect } from "next/navigation";

import { WhoopDisconnectButton } from "@/components/integrations/whoop-disconnect-button";
import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import {
  JarvisAlert,
  JarvisCard,
  JarvisPageContent,
} from "@/components/jarvis/jarvis-ui";
import { JarvisPageHeader } from "@/components/jarvis/jarvis-page-header";
import { toWhoopSafeConnectionSummary } from "@/lib/jarvis/integrations/whoop/whoop-connection-tools";
import { createClient } from "@/lib/supabase/server";

function formatConnectionDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function WhoopIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const { status, error } = await searchParams;

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
    .from("whoop_connections")
    .select(
      "id, status, whoop_user_id, connected_at, granted_scopes, last_error_code",
    )
    .eq("user_id", userId)
    .maybeSingle();

  const summary = toWhoopSafeConnectionSummary(connection);

  return (
    <JarvisAppShell>
      <JarvisPageContent>
        <JarvisPageHeader
          title="WHOOP Connection"
          subtitle="Connect Jarvis to WHOOP for fitness data."
        />

        {status === "connected" ? (
          <JarvisAlert variant="success">WHOOP connected successfully.</JarvisAlert>
        ) : null}

        {status === "disconnected" ? (
          <JarvisAlert variant="success">WHOOP disconnected.</JarvisAlert>
        ) : null}

        {status === "error" || error ? (
          <JarvisAlert variant="error">WHOOP connection failed.</JarvisAlert>
        ) : null}

        <JarvisCard>
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm text-[var(--navy-muted)]">Provider</p>
              <p className="text-base font-medium text-[var(--foreground)]">
                WHOOP
              </p>
            </div>

            <div>
              <p className="text-sm text-[var(--navy-muted)]">Status</p>
              <p className="text-base font-medium text-[var(--foreground)]">
                {summary.connected ? "Connected" : "Not connected"}
              </p>
            </div>

            {summary.connectedAt ? (
              <div>
                <p className="text-sm text-[var(--navy-muted)]">Connected</p>
                <p className="text-base text-[var(--foreground)]">
                  {formatConnectionDate(summary.connectedAt)}
                </p>
              </div>
            ) : null}

            {summary.grantedScopesDisplay ? (
              <div>
                <p className="text-sm text-[var(--navy-muted)]">Granted scopes</p>
                <p className="text-sm text-[var(--foreground)]">
                  {summary.grantedScopesDisplay}
                </p>
              </div>
            ) : null}

            {summary.lastErrorMessage ? (
              <div>
                <p className="text-sm text-[var(--navy-muted)]">
                  Connection notice
                </p>
                <p className="text-sm text-[var(--foreground)]">
                  {summary.lastErrorMessage}
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 pt-2">
              {!summary.connected ? (
                <Link
                  href="/api/integrations/whoop/connect"
                  className="inline-flex items-center justify-center rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Connect WHOOP
                </Link>
              ) : (
                <WhoopDisconnectButton />
              )}
            </div>
          </div>
        </JarvisCard>
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
