import Link from "next/link";
import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisChat } from "@/components/jarvis/jarvis-chat";
import { JarvisPageContent } from "@/components/jarvis/jarvis-ui";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AssistantPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  const userId =
    typeof data.claims.sub === "string" ? data.claims.sub : null;

  let displayName = "Parker";

  if (userId) {
    const { data: profile } = await supabase
      .from("jarvis_profiles")
      .select("preferred_name")
      .eq("user_id", userId)
      .maybeSingle();

    displayName = profile?.preferred_name?.trim() || "Parker";
  }

  return (
    <JarvisAppShell mainClassName="app-main--assistant">
      <JarvisPageContent className="jv-page-content--assistant">
        <Link href="/" className="jv-back-link jv-back-link--assistant">
          ← Command Center
        </Link>
        <JarvisChat variant="fullPage" userName={displayName} />
      </JarvisPageContent>
    </JarvisAppShell>
  );
}
