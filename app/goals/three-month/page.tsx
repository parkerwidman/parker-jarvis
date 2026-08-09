import { GoalsPage } from "@/components/jarvis/goals/goals-page";
import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisPageContent } from "@/components/jarvis/jarvis-ui";
import { loadGoals } from "@/lib/jarvis/goals/load-goals";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ThreeMonthGoalsPage() {
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

  const data = await loadGoals(supabase, userId, "three_month");

  return (
    <JarvisAppShell mainClassName="cc2-shell cc2-shell--goals">
      <JarvisPageContent className="jv-page-content--goals">
        <GoalsPage data={data} goalType="three_month" />
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
