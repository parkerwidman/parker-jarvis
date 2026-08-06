import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { MelusiExpensesImport } from "@/components/melusi/melusi-expenses-import";
import { MelusiNav } from "@/components/melusi/melusi-nav";
import { JarvisPageContent } from "@/components/jarvis/jarvis-ui";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function MelusiExpensesPage() {
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

  return (
    <JarvisAppShell mainClassName="app-main--life-area">
      <JarvisPageContent className="jv-page-content--melusi">
        <MelusiNav />
        <MelusiExpensesImport />
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
