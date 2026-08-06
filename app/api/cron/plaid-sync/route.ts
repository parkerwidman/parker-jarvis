import { NextResponse } from "next/server";
import {
  authorizeCronRequest,
  resolveJarvisOwnerUserId,
} from "@/lib/cron/cron-auth";
import { runScheduledPlaidSync } from "@/lib/jarvis/integrations/plaid/plaid-scheduled-sync";
import { createAutomationClient } from "@/lib/supabase/automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.log("[plaid-sync cron] missing_server_configuration");
    return NextResponse.json(
      { error: "missing_server_configuration" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  if (!authorizeCronRequest(request)) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const ownerUserId = resolveJarvisOwnerUserId();

  if (!ownerUserId) {
    console.log("[plaid-sync cron] missing_server_configuration");
    return NextResponse.json(
      { error: "missing_server_configuration" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  console.log("[plaid-sync cron] starting");

  try {
    const supabase = createAutomationClient();
    const aggregate = await runScheduledPlaidSync(supabase, ownerUserId);

    const status =
      aggregate.connectionsAttempted === 0
        ? "no_eligible_connections"
        : "completed";

    console.log("[plaid-sync cron] succeeded", status, aggregate.connectionsAttempted);

    return NextResponse.json(
      {
        success: true,
        status,
        ...aggregate,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    console.log("[plaid-sync cron] scheduled_sync_failed");
    return NextResponse.json(
      { error: "scheduled_sync_failed" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
