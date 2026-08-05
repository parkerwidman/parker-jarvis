import { createClient } from "@/lib/supabase/server";
import { disconnectMetricoolConnection } from "@/lib/jarvis/integrations/metricool/metricool-connection-tools";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const userId =
    typeof data.claims.sub === "string" ? data.claims.sub : null;

  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    await disconnectMetricoolConnection(supabase, userId);
    return NextResponse.json({ ok: true, status: "disconnected" });
  } catch {
    return NextResponse.json(
      { ok: false, error: "disconnect_failed" },
      { status: 500 },
    );
  }
}
