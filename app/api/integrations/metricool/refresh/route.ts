import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadMetricoolSocialDashboard } from "@/lib/jarvis/integrations/metricool/metricool-social-dashboard";

export async function POST(request: NextRequest) {
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

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;

  const result = await loadMetricoolSocialDashboard(
    supabase,
    userId,
    baseUrl,
  );

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.errorCode,
        message: result.message,
        connection: result.connection,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    refreshedAt: result.snapshot.refreshedAt,
  });
}
