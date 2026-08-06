import { FinanceCommandCenter } from "@/components/finance/finance-command-center";
import { CommandCenterContextLayout } from "@/components/jarvis/command-center-context-layout";
import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisPageContent } from "@/components/jarvis/jarvis-ui";
import { loadFinanceCommandCenter } from "@/lib/jarvis/finance/load-finance-command-center";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function FinancePage() {
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

  const result = await loadFinanceCommandCenter(supabase, userId);

  return (
    <JarvisAppShell mainClassName="app-main--command-center">
      <JarvisPageContent className="jv-page-content--finance">
        <CommandCenterContextLayout>
          <FinanceCommandCenter
            data={result.success ? result.data : null}
            loadError={result.success ? null : result.error}
          />
        </CommandCenterContextLayout>
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
