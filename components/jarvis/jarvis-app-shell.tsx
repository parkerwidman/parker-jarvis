import { createClient } from "@/lib/supabase/server";
import type { ReactNode } from "react";
import { JarvisSidebar } from "./jarvis-sidebar";

type JarvisAppShellProps = {
  children: ReactNode;
  mainClassName?: string;
};

export async function JarvisAppShell({
  children,
  mainClassName,
}: JarvisAppShellProps) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();

  const userId =
    typeof authData?.claims?.sub === "string" ? authData.claims.sub : null;
  const userEmail =
    typeof authData?.claims?.email === "string" ? authData.claims.email : null;

  let displayName = "Parker";

  if (userId) {
    const { data: profile } = await supabase
      .from("jarvis_profiles")
      .select("preferred_name")
      .eq("user_id", userId)
      .maybeSingle();

    displayName = profile?.preferred_name?.trim() || "Parker";
  }

  const mainClasses = ["app-main", mainClassName].filter(Boolean).join(" ");

  return (
    <div className="app-shell">
      <JarvisSidebar displayName={displayName} userEmail={userEmail} />
      <div className={mainClasses}>{children}</div>
    </div>
  );
}
