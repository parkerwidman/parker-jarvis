import { createClient } from "@/lib/supabase/server";
import {
  exchangePublicToken,
  fetchInstitutionName,
  fetchItemInstitutionId,
} from "@/lib/jarvis/integrations/plaid/plaid-client";
import {
  loadPlaidConnectionRowByItemId,
  markPlaidConnectionErrorByItemId,
  savePlaidConnectedConnection,
} from "@/lib/jarvis/integrations/plaid/plaid-connection-tools";
import { PlaidSafeError } from "@/lib/jarvis/integrations/plaid/plaid-types";
import { NextRequest, NextResponse } from "next/server";

const MAX_PUBLIC_TOKEN_LENGTH = 512;

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

  const publicToken =
    body &&
    typeof body === "object" &&
    "publicToken" in body &&
    typeof (body as { publicToken: unknown }).publicToken === "string"
      ? (body as { publicToken: string }).publicToken.trim()
      : null;

  if (
    !publicToken ||
    publicToken.length === 0 ||
    publicToken.length > MAX_PUBLIC_TOKEN_LENGTH
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 },
    );
  }

  let exchangedItemId: string | null = null;

  try {
    const { accessToken, itemId } = await exchangePublicToken(publicToken);
    exchangedItemId = itemId;

    const existingItem = await loadPlaidConnectionRowByItemId(supabase, itemId);
    if (existingItem && existingItem.user_id !== userId) {
      return NextResponse.json(
        { ok: false, error: "exchange_failed" },
        { status: 409 },
      );
    }

    const institutionId = await fetchItemInstitutionId(accessToken);

    let institutionName: string | null = null;
    if (institutionId) {
      const institution = await fetchInstitutionName(institutionId);
      institutionName = institution.institutionName;
    }

    const connection = await savePlaidConnectedConnection(supabase, userId, {
      itemId,
      institutionId,
      institutionName,
      accessToken,
    });

    return NextResponse.json({
      ok: true,
      connection,
    });
  } catch (caught) {
    const code =
      caught instanceof PlaidSafeError ? caught.code : "exchange_failed";

    if (exchangedItemId) {
      try {
        await markPlaidConnectionErrorByItemId(
          supabase,
          userId,
          exchangedItemId,
          code,
        );
      } catch {
        // Best-effort per-Item status update; original error still returned.
      }
    }

    return NextResponse.json(
      { ok: false, error: code },
      { status: 400 },
    );
  }
}
