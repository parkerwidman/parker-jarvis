import { NextResponse } from "next/server";

import { WHOOP_WEBHOOK_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-webhook-errors";
import { handleWhoopWebhook } from "@/lib/jarvis/integrations/whoop/whoop-webhook-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function safeWebhookFailureResponse(httpStatus = 502) {
  return NextResponse.json(
    { ok: false, error: WHOOP_WEBHOOK_ERROR_CODES.failed },
    { status: httpStatus, headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("X-WHOOP-Signature");
    const signatureTimestamp = request.headers.get("X-WHOOP-Signature-Timestamp");

    const result = await handleWhoopWebhook({
      rawBody,
      signature,
      signatureTimestamp,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.httpStatus, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE_HEADERS });
  } catch {
    console.error("[whoop-webhook]", {
      integration: "whoop",
      operation: "webhook",
      error_code: WHOOP_WEBHOOK_ERROR_CODES.failed,
    });

    return safeWebhookFailureResponse();
  }
}
