import { MorningRitualGate } from "@/components/jarvis/morning-ritual/morning-ritual-gate";
import { loadMorningRitualEntry } from "@/lib/jarvis/rituals/load-morning-ritual-entry";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function WakePage() {
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

  const email =
    typeof authData.claims.email === "string" ? authData.claims.email : null;

  const entry = await loadMorningRitualEntry({
    supabase,
    userId,
    email,
  });

  return <MorningRitualGate entry={entry} />;
}
