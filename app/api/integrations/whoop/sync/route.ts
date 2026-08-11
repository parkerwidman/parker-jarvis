import { NextRequest, NextResponse } from "next/server";

import { syncWhoopFitnessData } from "@/lib/jarvis/integrations/whoop/whoop-sync-service";
import { toWhoopSyncSafeUserMessage } from "@/lib/jarvis/integrations/whoop/whoop-sync-errors";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

export async function POST(_request: NextRequest) {
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

  const result = await syncWhoopFitnessData(userId);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        message: toWhoopSyncSafeUserMessage(result.error),
      },
      { status: result.httpStatus },
    );
  }

  return NextResponse.json({
    ok: true,
    summary: result.summary,
  });
}
