import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { CommandCenterContextLayout } from "@/components/jarvis/command-center-context-layout";
import { CommandCenterDashboard } from "@/components/jarvis/command-center/command-center-dashboard";
import { loadCommandCenter } from "@/lib/jarvis/dashboard/load-command-center";
import { getGreeting } from "@/lib/jarvis/dashboard/command-center-utils";
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
  const greeting = getGreeting(data.timezone);

  return (
    <JarvisAppShell mainClassName="app-main--command-center cc2-shell">
      <CommandCenterContextLayout>
        <CommandCenterDashboard
          data={data}
          displayName={displayName}
          greeting={greeting}
        />
      </CommandCenterContextLayout>
    </JarvisAppShell>
  );
}
