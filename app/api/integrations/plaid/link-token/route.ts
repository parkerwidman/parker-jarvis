import { createClient } from "@/lib/supabase/server";
import { createLinkToken } from "@/lib/jarvis/integrations/plaid/plaid-client";
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

  try {
    const { linkToken, expiration } = await createLinkToken(userId);

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
