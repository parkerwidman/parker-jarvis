import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { MelusiNav } from "@/components/melusi/melusi-nav";
import { MetricoolConnectionActions } from "@/components/melusi/metricool-connection-panel";
import {
  JarvisAlert,
  JarvisCard,
  JarvisPageContent,
} from "@/components/jarvis/jarvis-ui";
import {
  TRUSTED_BRAND_ID,
  TRUSTED_BRAND_TIMEZONE,
} from "@/lib/jarvis/integrations/metricool/metricool-config";
import { loadSafeMetricoolConnection } from "@/lib/jarvis/integrations/metricool/metricool-connection-tools";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

function formatVerifiedAt(isoString: string, timeZone: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

function connectionAlertMessage(error: string | undefined): string | null {
  switch (error) {
    case "brand_mismatch":
      return "Metricool connected, but the account did not match the trusted Melusi brand. Reconnect with the correct Metricool brand.";
    case "state_invalid":
      return "The Metricool authorization session expired or was invalid. Please try connecting again.";
    case "connection_failed":
      return "Could not complete the Metricool connection. Please try again.";
    default:
      return error ? "Could not complete the Metricool connection." : null;
  }
}

export default async function MelusiSocialPage({
  searchParams,
}: {
  searchParams: Promise<{
    connected?: string;
    error?: string;
    status?: string;
  }>;
}) {
  const { connected, error, status } = await searchParams;
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

  const [{ data: profileRow }, connection] = await Promise.all([
    supabase
      .from("jarvis_profiles")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle(),
    loadSafeMetricoolConnection(supabase, userId),
  ]);

  const timeZone = profileRow?.timezone?.trim() || TRUSTED_BRAND_TIMEZONE;
  const alertMessage = connectionAlertMessage(error);
  const isConnecting =
    connection.status === "connecting" || status === "connecting";
  const isConnected = connection.status === "connected";
  const needsReconnect =
    connection.status === "reconnect_required" || connection.status === "error";

  return (
    <JarvisAppShell mainClassName="app-main--life-area">
      <JarvisPageContent className="jv-page-content--melusi">
        <header className="melusi-header">
          <div className="melusi-header-copy">
            <Link href="/melusi" className="jv-back-link">
              ← Melusi Command Center
            </Link>
            <h1 className="melusi-title">Social</h1>
            <p className="melusi-subtitle">
              Connect Metricool to verify Melusi&apos;s social brand. Analytics
              dashboards and scheduling are not enabled in this step.
            </p>
          </div>
        </header>

        <MelusiNav />

        {connected === "true" ? (
          <JarvisAlert variant="success">
            Metricool connected and verified for the trusted Melusi brand.
          </JarvisAlert>
        ) : null}

        {alertMessage ? (
          <JarvisAlert variant="error">{alertMessage}</JarvisAlert>
        ) : null}

        <JarvisCard title="Metricool connection" accent="purple">
          {isConnecting ? (
            <div className="jv-connection-disconnected">
              <div className="jv-connection-indicator">
                <span
                  className="jv-status-dot"
                  aria-hidden="true"
                />
                <span className="jv-connection-label">Connecting to Metricool…</span>
              </div>
              <p className="jv-connection-meta">
                Finish authorization in Metricool if prompted. This page will
                update after the connection completes.
              </p>
            </div>
          ) : isConnected ? (
            <div className="jv-connection-status">
              <div className="jv-connection-indicator">
                <span className="jv-status-dot" aria-hidden="true" />
                <span className="jv-connection-label">Connected to Metricool</span>
              </div>

              <p className="jv-connection-meta">
                Read-only access is enabled. Jarvis can verify brand settings and
                run limited read-only Metricool checks. Scheduling and publishing
                are not enabled yet.
              </p>

              <dl className="melusi-connection-details">
                <div>
                  <dt>Brand label</dt>
                  <dd>{connection.brandLabel ?? "—"}</dd>
                </div>
                <div>
                  <dt>Verified brand ID</dt>
                  <dd>{connection.brandId ?? TRUSTED_BRAND_ID}</dd>
                </div>
                <div>
                  <dt>Timezone</dt>
                  <dd>{connection.brandTimezone ?? TRUSTED_BRAND_TIMEZONE}</dd>
                </div>
                <div>
                  <dt>Connected networks</dt>
                  <dd>
                    {connection.connectedNetworks.length > 0
                      ? connection.connectedNetworks.join(", ")
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Last verified</dt>
                  <dd>
                    {connection.lastVerifiedAt
                      ? formatVerifiedAt(connection.lastVerifiedAt, timeZone)
                      : "Not verified yet"}
                  </dd>
                </div>
              </dl>

              <MetricoolConnectionActions
                canVerify
                canDisconnect
                canReconnect={false}
              />
            </div>
          ) : needsReconnect ? (
            <div className="jv-connection-disconnected">
              <div className="jv-connection-indicator">
                <span
                  className="jv-status-dot jv-status-dot--offline"
                  aria-hidden="true"
                />
                <span className="jv-connection-label">
                  {connection.status === "error"
                    ? "Metricool connection error"
                    : "Reconnect required"}
                </span>
              </div>
              <p className="jv-connection-meta">
                {connection.status === "error"
                  ? "The saved Metricool connection could not be verified. Reconnect to restore read-only access."
                  : "Metricool authorization expired or was rejected. Reconnect to restore read-only access."}
              </p>
              <MetricoolConnectionActions
                canVerify={false}
                canDisconnect
                canReconnect
              />
            </div>
          ) : (
            <div className="jv-connection-disconnected">
              <div className="jv-connection-indicator">
                <span
                  className="jv-status-dot jv-status-dot--offline"
                  aria-hidden="true"
                />
                <span className="jv-connection-label">Metricool not connected</span>
              </div>
              <p className="jv-connection-meta">
                OAuth grants Jarvis read-only access to Melusi&apos;s trusted
                Metricool brand ({TRUSTED_BRAND_ID}). No analytics or posts are
                shown until a verified connection is established.
              </p>
              <a
                href="/api/integrations/metricool/connect"
                className="jv-btn jv-btn--primary jv-btn--inline"
              >
                Connect Metricool
              </a>
            </div>
          )}
        </JarvisCard>
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
