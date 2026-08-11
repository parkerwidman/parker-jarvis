import { NextResponse } from "next/server";

import {
  authorizeCronRequest,
  resolveJarvisOwnerUserId,
} from "@/lib/cron/cron-auth";
import { runWhoopReconcile } from "@/lib/jarvis/integrations/whoop/whoop-reconcile-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.log("[whoop-reconcile cron] missing_server_configuration");
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
    console.log("[whoop-reconcile cron] missing_server_configuration");
    return NextResponse.json(
      { error: "missing_server_configuration" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  console.log("[whoop-reconcile cron] starting");

  try {
    const result = await runWhoopReconcile(ownerUserId);

    console.log("[whoop-reconcile cron] succeeded", result.status);

    return NextResponse.json(
      {
        ok: true,
        status: result.status,
        webhook_events_retried: result.webhook_events_retried,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    console.log("[whoop-reconcile cron] reconcile_failed");
    return NextResponse.json(
      { ok: false, error: "reconcile_failed" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
