import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { CommandCenterContextLayout } from "@/components/jarvis/command-center-context-layout";
import { CommandCenterDashboard } from "@/components/jarvis/command-center/command-center-dashboard";
import { RitualEntryUrlCleanup } from "@/components/jarvis/ritual-entry-url-cleanup";
import { loadCommandCenter } from "@/lib/jarvis/dashboard/load-command-center";
import { getGreeting } from "@/lib/jarvis/dashboard/command-center-utils";
import {
  loadMorningRitualEntry,
} from "@/lib/jarvis/rituals/load-morning-ritual-entry";
import {
  MORNING_RITUAL_BYPASS_COOKIE,
  shouldRedirectHomeToWake,
} from "@/lib/jarvis/rituals/morning-ritual-bypass";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type HomeProps = {
  searchParams: Promise<{ ritualEntry?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
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

  const { ritualEntry } = await searchParams;
  const email =
    typeof authData.claims.email === "string" ? authData.claims.email : null;

  let entry;

  try {
    entry = await loadMorningRitualEntry({ supabase, userId, email });
  } catch {
    redirect("/wake");
  }

  const cookieStore = await cookies();
  const bypassRitualDate =
    cookieStore.get(MORNING_RITUAL_BYPASS_COOKIE)?.value ?? null;

  if (
    shouldRedirectHomeToWake({
      entry,
      ritualDate: entry.ritualDate,
      ritualEntry,
      bypassRitualDate,
    })
  ) {
    redirect("/wake");
  }

  const data = await loadCommandCenter(supabase, userId);
  const displayName = data.preferredName ?? "Parker";
  const greeting = getGreeting(data.timezone);

  return (
    <>
      <RitualEntryUrlCleanup />
      <JarvisAppShell mainClassName="app-main--command-center cc2-shell">
        <CommandCenterContextLayout>
          <CommandCenterDashboard
            data={data}
            displayName={displayName}
            greeting={greeting}
          />
        </CommandCenterContextLayout>
      </JarvisAppShell>
    </>
  );
}
