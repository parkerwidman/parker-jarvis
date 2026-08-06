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
import { connectionMatchesRuntimeEnvironment } from "@/lib/jarvis/integrations/plaid/plaid-environment-guard";
import {
  exchangeFailureHttpStatus,
  hasExchangeEncryptionKeyConfigured,
  logPlaidExchangeDiagnostic,
  resolvePlaidExchangeFailure,
} from "@/lib/jarvis/integrations/plaid/plaid-exchange-errors";
import { parseExchangePublicToken } from "@/lib/jarvis/integrations/plaid/plaid-exchange-payload";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    logPlaidExchangeDiagnostic({
      code: "unauthenticated",
      clientError: "unauthenticated",
    });
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const userId =
    typeof data.claims.sub === "string" ? data.claims.sub : null;

  if (!userId) {
    logPlaidExchangeDiagnostic({
      code: "unauthenticated",
      clientError: "unauthenticated",
    });
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    logPlaidExchangeDiagnostic({
      code: "invalid_request",
      clientError: "invalid_request",
    });
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 },
    );
  }

  const parsedPublicToken = parseExchangePublicToken(body);

  if (!parsedPublicToken) {
    logPlaidExchangeDiagnostic({
      code: "invalid_public_token_payload",
      clientError: "invalid_public_token_payload",
    });
    return NextResponse.json(
      { ok: false, error: "invalid_public_token_payload" },
      { status: 400 },
    );
  }

  const { publicToken } = parsedPublicToken;
  let exchangedItemId: string | null = null;
  const exchangeFailureContext = {
    encryptionKeyConfigured: hasExchangeEncryptionKeyConfigured(),
  };

  try {
    const { accessToken, itemId } = await exchangePublicToken(publicToken);
    exchangedItemId = itemId;

    const existingItem = await loadPlaidConnectionRowByItemId(supabase, itemId);
    if (existingItem && existingItem.user_id !== userId) {
      logPlaidExchangeDiagnostic({
        code: "duplicate_connection",
        clientError: "duplicate_connection",
      });
      return NextResponse.json(
        { ok: false, error: "duplicate_connection" },
        { status: 409 },
      );
    }

    if (existingItem && !connectionMatchesRuntimeEnvironment(existingItem)) {
      logPlaidExchangeDiagnostic({
        code: "exchange_failed",
        clientError: "exchange_failed",
      });
      return NextResponse.json(
        { ok: false, error: "exchange_failed" },
        { status: 400 },
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
    const failure = resolvePlaidExchangeFailure(caught, exchangeFailureContext);
    logPlaidExchangeDiagnostic(failure);

    if (exchangedItemId) {
      try {
        const existingItem = await loadPlaidConnectionRowByItemId(
          supabase,
          exchangedItemId,
        );

        if (
          existingItem &&
          existingItem.user_id === userId &&
          connectionMatchesRuntimeEnvironment(existingItem)
        ) {
          await markPlaidConnectionErrorByItemId(
            supabase,
            userId,
            exchangedItemId,
            failure.code,
          );
        }
      } catch {
        // Best-effort per-Item status update; original error still returned.
      }
    }

    return NextResponse.json(
      { ok: false, error: failure.clientError },
      { status: exchangeFailureHttpStatus(failure.code) },
    );
  }
}
