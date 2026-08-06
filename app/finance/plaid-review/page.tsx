import { PlaidTransactionMatchReview } from "@/components/finance/plaid-transaction-match-review";
import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisPageContent } from "@/components/jarvis/jarvis-ui";
import { loadPlaidTransactionMatchReview } from "@/lib/jarvis/integrations/plaid/load-plaid-transaction-match-review";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function PlaidTransactionMatchReviewPage() {
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

  const result = await loadPlaidTransactionMatchReview(supabase, userId);

  return (
    <JarvisAppShell mainClassName="app-main--command-center">
      <JarvisPageContent className="jv-page-content--finance">
        <PlaidTransactionMatchReview
          data={
            result.success
              ? result.data
              : {
                  timezone: "UTC",
                  pendingCount: 0,
                  pendingItems: [],
                  recentResolvedItems: [],
                }
          }
          loadError={result.success ? null : result.error}
        />
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
