import { createClient } from "@/lib/supabase/server";
import {
  syncAllPlaidConnectionsForUser,
  syncPlaidConnection,
} from "@/lib/jarvis/integrations/plaid/plaid-sync-service";
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

  const syncAll =
    body &&
    typeof body === "object" &&
    "syncAll" in body &&
    (body as { syncAll: unknown }).syncAll === true;

  if (syncAll && connectionId) {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 },
    );
  }

  if (!syncAll && (!connectionId || !UUID_PATTERN.test(connectionId))) {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 },
    );
  }

  try {
    const results = syncAll
      ? await syncAllPlaidConnectionsForUser(supabase, userId)
      : [await syncPlaidConnection(supabase, userId, connectionId!)];

    revalidatePath("/connections/plaid");

    return NextResponse.json({ ok: true, results });
  } catch (caught) {
    const code =
      caught instanceof PlaidSafeError ? caught.code : "sync_failed";

    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
