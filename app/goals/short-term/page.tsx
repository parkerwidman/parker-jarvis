import { GoalsPage } from "@/components/jarvis/goals/goals-page";
import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisPageContent } from "@/components/jarvis/jarvis-ui";
import { loadGoals } from "@/lib/jarvis/goals/load-goals";
import { readJarvisWorkspaceFromCookies } from "@/lib/jarvis/shell/read-jarvis-workspace";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ShortTermGoalsPage() {
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

  const domain = await readJarvisWorkspaceFromCookies();
  const data = await loadGoals(supabase, userId, "short_term", domain);

  return (
    <JarvisAppShell mainClassName="cc2-shell cc2-shell--goals">
      <JarvisPageContent className="jv-page-content--goals">
        <GoalsPage data={data} goalType="short_term" />
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
