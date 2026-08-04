import Link from "next/link";
import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisChat } from "@/components/jarvis/jarvis-chat";
import { JarvisPageContent } from "@/components/jarvis/jarvis-ui";
import { JarvisContextProvider } from "@/components/jarvis/context/jarvis-context-provider";
import { loadAssistantContext } from "@/lib/jarvis/context/load-assistant-context";
import { parseJarvisContextTarget } from "@/lib/jarvis/context/types";
import type { JarvisContextInitial } from "@/lib/jarvis/context/types";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ contextType?: string; contextId?: string }>;
}) {
  const { contextType, contextId } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  const userId =
    typeof data.claims.sub === "string" ? data.claims.sub : null;

  let displayName = "Parker";
  let initialContext: JarvisContextInitial | null = null;

  if (userId) {
    const { data: profile } = await supabase
      .from("jarvis_profiles")
      .select("preferred_name")
      .eq("user_id", userId)
      .maybeSingle();

    displayName = profile?.preferred_name?.trim() || "Parker";

    const parsedTarget = parseJarvisContextTarget(contextType, contextId);

    if (parsedTarget) {
      const loaded = await loadAssistantContext(
        supabase,
        userId,
        parsedTarget,
      );

      if (loaded.success) {
        initialContext = {
          type: loaded.context.type,
          id: loaded.context.id,
          displayLabel: loaded.displayLabel,
        };
      }
    }
  }

  return (
    <JarvisAppShell mainClassName="app-main--assistant">
      <JarvisPageContent className="jv-page-content--assistant">
        <Link href="/" className="jv-back-link jv-back-link--assistant">
          ← Command Center
        </Link>
        <JarvisContextProvider initialContext={initialContext}>
          <JarvisChat variant="fullPage" userName={displayName} />
        </JarvisContextProvider>
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
