import { createClient } from "@/lib/supabase/server";
import { createLinkToken } from "@/lib/jarvis/integrations/plaid/plaid-client";
import {
  linkTokenFailureHttpStatus,
  logPlaidLinkTokenDiagnostic,
  resolvePlaidLinkTokenFailure,
} from "@/lib/jarvis/integrations/plaid/plaid-link-token-errors";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    logPlaidLinkTokenDiagnostic({
      code: "unauthenticated",
      clientError: "unauthenticated",
    });
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const userId =
    typeof data.claims.sub === "string" ? data.claims.sub : null;

  if (!userId) {
    logPlaidLinkTokenDiagnostic({
      code: "unauthenticated",
      clientError: "unauthenticated",
    });
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  try {
    const { linkToken, expiration } = await createLinkToken(userId);

    return NextResponse.json({
      ok: true,
      linkToken,
      expiration,
    });
  } catch (caught) {
    const failure = resolvePlaidLinkTokenFailure(caught);
    logPlaidLinkTokenDiagnostic(failure);

    return NextResponse.json(
      { ok: false, error: failure.clientError },
      { status: linkTokenFailureHttpStatus(failure.code) },
    );
  }
}
