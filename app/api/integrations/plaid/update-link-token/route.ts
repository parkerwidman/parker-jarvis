import { createClient } from "@/lib/supabase/server";
import {
  classifyPlaidAccessTokenForUpdate,
  createUpdateLinkToken,
} from "@/lib/jarvis/integrations/plaid/plaid-client";
import {
  decryptStoredAccessToken,
  hasStoredPlaidAccessToken,
  loadPlaidConnectionRowById,
  markPlaidConnectionErrorById,
} from "@/lib/jarvis/integrations/plaid/plaid-connection-tools";
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

  try {
    const connection = await loadPlaidConnectionRowById(
      supabase,
      userId,
      connectionId,
    );

    if (!connection || !hasStoredPlaidAccessToken(connection)) {
      return NextResponse.json(
        { ok: false, error: "invalid_request" },
        { status: 404 },
      );
    }

    if (connection.status !== "reconnect_required") {
      return NextResponse.json(
        { ok: false, error: "invalid_request" },
        { status: 400 },
      );
    }

    const accessToken = decryptStoredAccessToken(connection);
    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "connection_failed" },
        { status: 400 },
      );
    }

    const tokenState = await classifyPlaidAccessTokenForUpdate(accessToken);
    if (tokenState === "not_repairable") {
      await markPlaidConnectionErrorById(
        supabase,
        userId,
        connectionId,
        "token_not_repairable",
        "error",
      );

      return NextResponse.json(
        { ok: false, error: "token_not_repairable" },
        { status: 400 },
      );
    }

    const { linkToken, expiration } = await createUpdateLinkToken(
      userId,
      accessToken,
    );

    return NextResponse.json({
      ok: true,
      linkToken,
      expiration,
    });
  } catch (caught) {
    const code =
      caught instanceof PlaidSafeError ? caught.code : "connection_failed";

    return NextResponse.json(
      { ok: false, error: code },
      { status: code === "not_configured" ? 500 : 400 },
    );
  }
}
