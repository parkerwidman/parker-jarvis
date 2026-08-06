import { createClient } from "@/lib/supabase/server";
import { removePlaidItem } from "@/lib/jarvis/integrations/plaid/plaid-client";
import {
  decryptStoredAccessToken,
  disconnectPlaidConnectionById,
  hasUsablePlaidCredentials,
  markPlaidConnectionErrorById,
} from "@/lib/jarvis/integrations/plaid/plaid-connection-tools";
import { loadRuntimePlaidConnectionRowById } from "@/lib/jarvis/integrations/plaid/plaid-environment-guard";
import { PlaidSafeError } from "@/lib/jarvis/integrations/plaid/plaid-types";
import { NextRequest, NextResponse } from "next/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 },
    );
  }

  const connectionId =
    body &&
    typeof body === "object" &&
    "connectionId" in body &&
    typeof (body as { connectionId: unknown }).connectionId === "string"
      ? (body as { connectionId: string }).connectionId.trim()
      : null;

  if (!connectionId || !UUID_PATTERN.test(connectionId)) {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 },
    );
  }

  const row = await loadRuntimePlaidConnectionRowById(supabase, userId, connectionId);

  if (!row || row.status === "disconnected") {
    return NextResponse.json(
      { ok: false, error: "item_not_found", status: "disconnected" },
      { status: 400 },
    );
  }

  if (hasUsablePlaidCredentials(row)) {
    const accessToken = decryptStoredAccessToken(row);

    if (!accessToken) {
      await markPlaidConnectionErrorById(
        supabase,
        userId,
        connectionId,
        "decryption_failed",
        "reconnect_required",
      );
      return NextResponse.json(
        { ok: false, error: "decryption_failed", status: "reconnect_required" },
        { status: 400 },
      );
    }

    try {
      await removePlaidItem(accessToken);
    } catch (caught) {
      const code =
        caught instanceof PlaidSafeError ? caught.code : "disconnect_failed";

      const remoteItemAlreadyUnusable =
        caught instanceof PlaidSafeError &&
        caught.code === "token_not_repairable";

      if (!remoteItemAlreadyUnusable) {
        await markPlaidConnectionErrorById(
          supabase,
          userId,
          connectionId,
          code,
          "error",
        );

        return NextResponse.json(
          { ok: false, error: code, status: "error" },
          { status: 400 },
        );
      }
    }
  }

  try {
    await disconnectPlaidConnectionById(supabase, userId, connectionId);
    return NextResponse.json({ ok: true, status: "disconnected" });
  } catch {
    return NextResponse.json(
      { ok: false, error: "disconnect_failed" },
      { status: 500 },
    );
  }
}
