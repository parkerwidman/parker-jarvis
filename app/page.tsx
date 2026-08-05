import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisChat } from "@/components/jarvis/jarvis-chat";
import { ActiveGoalsSection } from "@/components/jarvis/command-center/active-goals-section";
import { CommandCenterHeader } from "@/components/jarvis/command-center/command-center-header";
import { CommandCenterContextLayout } from "@/components/jarvis/command-center-context-layout";
import { FocusNowSection } from "@/components/jarvis/command-center/focus-now-section";
import { NeedsAttentionSection } from "@/components/jarvis/command-center/needs-attention-section";
import { TodaysScheduleSection } from "@/components/jarvis/command-center/todays-schedule-section";
import { TodaysTasksSection } from "@/components/jarvis/command-center/todays-tasks-section";
import { loadCommandCenter } from "@/lib/jarvis/dashboard/load-command-center";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
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

  const data = await loadCommandCenter(supabase, userId);
  const displayName = data.preferredName ?? "Parker";

  const jarvisStatusLine =
    data.focusTask !== null
      ? `#1 Priority: ${data.focusTask.title}`
      : data.headerStatus;

  return (
    <JarvisAppShell mainClassName="app-main--command-center">
      <CommandCenterHeader
        displayName={displayName}
        dateLabel={data.todayDateLabel}
        todayDate={data.todayDate}
        headerStatus={data.headerStatus}
        timeZone={data.timezone}
      />

      <CommandCenterContextLayout>
        <div className="cc-dash-layout">
          <FocusNowSection focusTask={data.focusTask} timeZone={data.timezone} />

          <div className="cc-dash-main-grid">
            <TodaysTasksSection
              taskGroups={data.taskGroups}
              timeZone={data.timezone}
            />
            <TodaysScheduleSection schedule={data.schedule} timeZone={data.timezone} />
          </div>

          <div className="cc-dash-lower-grid">
            <ActiveGoalsSection goals={data.goals} />
            <NeedsAttentionSection items={data.attentionItems} />
          </div>

          <JarvisChat
            variant="compact"
            userName={displayName}
            compactStatusLine={jarvisStatusLine}
          />
        </div>
      </CommandCenterContextLayout>
    </JarvisAppShell>
  );
}
