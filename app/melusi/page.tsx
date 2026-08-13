import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { CommandCenterContextLayout } from "@/components/jarvis/command-center-context-layout";
import { MelusiCommandCenterDashboard } from "@/components/melusi/command-center/melusi-command-center-dashboard";
import { MelusiJarvisPanel } from "@/components/melusi/melusi-jarvis-panel";
import { JarvisAlert, JarvisPageContent } from "@/components/jarvis/jarvis-ui";
import { loadRecentThreadMessages } from "@/lib/jarvis/agents/agent-message-tools";
import { findMelusiCommandThread } from "@/lib/jarvis/agents/agent-thread-tools";
import { toChatInitialMessages } from "@/lib/jarvis/agents/load-agent-thread";
import { loadMelusiCommandCenter } from "@/lib/jarvis/melusi/load-melusi-command-center";
import {
  loadSafeMetricoolConnection,
  toCommandCenterStatus,
} from "@/lib/jarvis/integrations/metricool/metricool-connection-tools";
import {
  loadMetricoolSocialDashboard,
  toSocialCommandCenterSummary,
} from "@/lib/jarvis/integrations/metricool/metricool-social-dashboard";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function MelusiPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; updated?: string }>;
}) {
  const { error, created, updated } = await searchParams;
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

  const [commandThread, metricoolConnection] = await Promise.all([
    findMelusiCommandThread(supabase, userId),
    loadSafeMetricoolConnection(supabase, userId),
  ]);

  const socialCommandStatus = toCommandCenterStatus(metricoolConnection);
  const socialConnected = socialCommandStatus === "connected";

  let socialSummary = null;

  if (socialConnected) {
    try {
      const socialDashboard = await loadMetricoolSocialDashboard(
        supabase,
        userId,
        process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
      );

      if (socialDashboard.ok) {
        socialSummary = toSocialCommandCenterSummary(socialDashboard.snapshot);
      }
    } catch {
      socialSummary = null;
    }
  }

  const data = await loadMelusiCommandCenter(supabase, userId, {
    summary: socialSummary,
    connected: socialConnected,
    status: socialCommandStatus,
  });

  const commandMessages = commandThread
    ? toChatInitialMessages(
        await loadRecentThreadMessages(supabase, userId, commandThread.id),
      )
    : [];

  const expandHref = commandThread
    ? `/melusi/threads/${commandThread.id}`
    : "/melusi/threads";

  const jarvisStatusLine =
    data.businessPriority?.kind === "task"
      ? `#1 Business Priority: ${data.businessPriority.title}`
      : data.businessPriority?.kind === "project-planning"
        ? `Assign next action for ${data.businessPriority.projectName}`
        : data.headerStatus;

  return (
    <JarvisAppShell mainClassName="app-main--command-center">
      <JarvisPageContent className="jv-page-content--melusi-command melusi-workspace">
        {created ? (
          <JarvisAlert variant="success">Project created.</JarvisAlert>
        ) : null}
        {updated ? (
          <JarvisAlert variant="success">Project status updated.</JarvisAlert>
        ) : null}
        {error ? <JarvisAlert variant="error">{error}</JarvisAlert> : null}

        <CommandCenterContextLayout>
          <MelusiCommandCenterDashboard
            data={data}
            jarvisPanel={
              <MelusiJarvisPanel
                userName={data.preferredName}
                threadId={commandThread?.id ?? null}
                initialMessages={commandMessages}
                expandHref={expandHref}
                socialConnected={socialConnected}
                variant="compact"
                compactStatusLine={jarvisStatusLine}
              />
            }
          />
        </CommandCenterContextLayout>
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
