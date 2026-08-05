import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { MelusiNav } from "@/components/melusi/melusi-nav";
import { SocialCommandCenter } from "@/components/melusi/social-command-center";
import { JarvisAlert, JarvisPageContent } from "@/components/jarvis/jarvis-ui";
import { TRUSTED_BRAND_TIMEZONE } from "@/lib/jarvis/integrations/metricool/metricool-config";
import { loadSafeMetricoolConnection } from "@/lib/jarvis/integrations/metricool/metricool-connection-tools";
import {
  createFailedSocialCommandCenterSnapshot,
  loadMetricoolSocialDashboard,
} from "@/lib/jarvis/integrations/metricool/metricool-social-dashboard";
import type { SocialCommandCenterSnapshot } from "@/lib/jarvis/integrations/metricool/metricool-social-types";
import { isActiveMetricoolOAuthFlow } from "@/lib/jarvis/integrations/metricool/metricool-oauth-cookies";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

function connectionAlertMessage(error: string | undefined): string | null {
  switch (error) {
    case "brand_mismatch":
      return "Metricool connected, but the account did not match the trusted Melusi brand. Reconnect with the correct Metricool brand.";
    case "state_invalid":
      return "The Metricool authorization session expired or was invalid. Please try connecting again.";
    case "oauth_client_registration_failed":
      return "The Metricool OAuth client could not be prepared for this environment. Please try again.";
    case "authorization_url_failed":
      return "The Metricool authorization redirect could not be created. Please try again.";
    case "oauth_token_refresh_failed":
    case "oauth_verification_failed":
      return "Metricool authorization could not be started with the saved connection. Please try reconnecting.";
    case "connection_failed":
      return "Could not complete the Metricool connection. Please try again.";
    default:
      return error ? "Metricool authorization could not be started." : null;
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

  if (status === "connecting" && connection.status !== "connecting") {
    const params = new URLSearchParams();
    if (connected === "true") {
      params.set("connected", "true");
    }
    if (error) {
      params.set("error", error);
    }
    const query = params.toString();
    redirect(query ? `/melusi/social?${query}` : "/melusi/social");
  }

  const timeZone = profileRow?.timezone?.trim() || TRUSTED_BRAND_TIMEZONE;
  const alertMessage = connectionAlertMessage(error);
  const cookieStore = await cookies();
  const oauthFlowActive = isActiveMetricoolOAuthFlow(cookieStore, userId);
  const isConnecting = connection.status === "connecting";
  const showOAuthInProgress = isConnecting && oauthFlowActive;
  const showConnectionRecovery = isConnecting && !oauthFlowActive;
  const isConnected = connection.status === "connected";
  const needsReconnect =
    connection.status === "reconnect_required" || connection.status === "error";

  let snapshot: SocialCommandCenterSnapshot | null = null;
  let loadError: string | null = null;

  if (isConnected) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const dashboardResult = await loadMetricoolSocialDashboard(
      supabase,
      userId,
      baseUrl,
    );

    if (dashboardResult.ok) {
      snapshot = dashboardResult.snapshot;
    } else {
      loadError = dashboardResult.message;
      snapshot = createFailedSocialCommandCenterSnapshot(
        dashboardResult.connection,
        timeZone,
      );
    }
  }

  return (
    <JarvisAppShell mainClassName="app-main--command-center">
      <JarvisPageContent className="jv-page-content--melusi-command melusi-workspace">
        <MelusiNav />

        {connected === "true" ? (
          <JarvisAlert variant="success">
            Metricool connected and verified for the trusted Melusi brand.
          </JarvisAlert>
        ) : null}

        {alertMessage ? (
          <JarvisAlert variant="error">{alertMessage}</JarvisAlert>
        ) : null}

        {showOAuthInProgress ? (
          <JarvisAlert variant="info">
            Metricool OAuth is in progress. Finish authorization if prompted,
            then return here.
          </JarvisAlert>
        ) : null}

        <SocialCommandCenter
          connection={connection}
          snapshot={snapshot}
          loadError={loadError}
          timeZone={timeZone}
          canVerify={isConnected}
          canDisconnect={isConnected || needsReconnect}
          canReconnect={needsReconnect}
          showConnectionRecovery={showConnectionRecovery}
        />
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
