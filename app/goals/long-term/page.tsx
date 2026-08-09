import { GoalsPage } from "@/components/jarvis/goals/goals-page";
import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisPageContent } from "@/components/jarvis/jarvis-ui";
import { loadGoals } from "@/lib/jarvis/goals/load-goals";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function LongTermGoalsPage() {
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

  const data = await loadGoals(supabase, userId, "long_term");

  return (
    <JarvisAppShell mainClassName="cc2-shell">
      <JarvisPageContent className="jv-page-content--goals">
        <GoalsPage data={data} goalType="long_term" />
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
