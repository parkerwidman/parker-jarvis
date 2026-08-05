import { createClient } from "@/lib/supabase/server";
import { completePlaidConnectionUpdate } from "@/lib/jarvis/integrations/plaid/plaid-connection-tools";
import { PlaidSafeError } from "@/lib/jarvis/integrations/plaid/plaid-types";
import { revalidatePath } from "next/cache";
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
    const result = await completePlaidConnectionUpdate(
      supabase,
      userId,
      connectionId,
    );

    revalidatePath("/connections/plaid");

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          connection: result.connection,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      connection: result.connection,
    });
  } catch (caught) {
    const code =
      caught instanceof PlaidSafeError ? caught.code : "update_failed";

    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
