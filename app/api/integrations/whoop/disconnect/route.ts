import { NextRequest, NextResponse } from "next/server";

import { executeWhoopDisconnect } from "@/lib/jarvis/integrations/whoop/whoop-disconnect-service";
import { createClient } from "@/lib/supabase/server";

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

  const result = await executeWhoopDisconnect(userId);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        status: result.status,
      },
      { status: result.httpStatus },
    );
  }

  return NextResponse.json({ ok: true, status: result.status });
}
