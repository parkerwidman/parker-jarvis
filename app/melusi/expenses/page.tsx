import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { MelusiExpenseCommandCenter } from "@/components/melusi/melusi-expense-command-center";
import { MelusiExpensesImport } from "@/components/melusi/melusi-expenses-import";
import { MelusiNav } from "@/components/melusi/melusi-nav";
import { JarvisPageContent } from "@/components/jarvis/jarvis-ui";
import { loadMelusiExpenses } from "@/lib/jarvis/finance/load-melusi-expenses";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const LOAD_ERROR_MESSAGE =
  "Could not load Melusi expense records. Try refreshing the page.";

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

  const result = await loadMelusiExpenses(supabase, userId);

  return (
    <JarvisAppShell mainClassName="app-main--command-center">
      <JarvisPageContent className="jv-page-content--melusi-command melusi-workspace">
        <MelusiNav />
        <MelusiExpenseCommandCenter
          data={result.success ? result.data : null}
          loadError={result.success ? null : LOAD_ERROR_MESSAGE}
        />
        <MelusiExpensesImport
          defaultExpanded={
            result.success ? result.data.totalExpenseRecordCount === 0 : true
          }
        />
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
