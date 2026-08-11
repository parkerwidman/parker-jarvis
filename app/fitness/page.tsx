import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { FitnessDashboard } from "@/components/fitness/fitness-dashboard";
import { loadFitnessTodaySnapshot } from "@/lib/jarvis/fitness/load-fitness-today-snapshot";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function FitnessPage() {
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

  const snapshot = await loadFitnessTodaySnapshot(supabase, userId);

  return (
    <JarvisAppShell mainClassName="app-main--command-center">
      <FitnessDashboard snapshot={snapshot} />
    </JarvisAppShell>
  );
}
