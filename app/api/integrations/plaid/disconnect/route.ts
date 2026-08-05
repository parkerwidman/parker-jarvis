import { createClient } from "@/lib/supabase/server";
import { removePlaidItem } from "@/lib/jarvis/integrations/plaid/plaid-client";
import {
  decryptStoredAccessToken,
  disconnectPlaidConnection,
  hasUsablePlaidCredentials,
  loadPlaidConnectionRow,
  markPlaidConnectionError,
} from "@/lib/jarvis/integrations/plaid/plaid-connection-tools";
import { PlaidSafeError } from "@/lib/jarvis/integrations/plaid/plaid-types";
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

  const row = await loadPlaidConnectionRow(supabase, userId);

  if (!row || row.status === "disconnected") {
    return NextResponse.json(
      { ok: false, error: "item_not_found", status: "disconnected" },
      { status: 400 },
    );
  }

  if (hasUsablePlaidCredentials(row)) {
    const accessToken = decryptStoredAccessToken(row);

    if (!accessToken) {
      await markPlaidConnectionError(
        supabase,
        userId,
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

      await markPlaidConnectionError(supabase, userId, code, "error");

      return NextResponse.json(
        { ok: false, error: code, status: "error" },
        { status: 400 },
      );
    }
  }

  try {
    await disconnectPlaidConnection(supabase, userId);
    return NextResponse.json({ ok: true, status: "disconnected" });
  } catch {
    return NextResponse.json(
      { ok: false, error: "disconnect_failed" },
      { status: 500 },
    );
  }
}
