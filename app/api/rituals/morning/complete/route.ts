import { NextRequest, NextResponse } from "next/server";

import { isValidBriefingDate } from "@/lib/jarvis/audio/storage-path";
import { completeMorningRitual } from "@/lib/jarvis/rituals/morning-ritual-service";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

function jsonResponse(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: PRIVATE_NO_STORE_HEADERS,
  });
}

export async function POST(request: NextRequest) {
  let supabase;

  try {
    supabase = await createClient();
  } catch {
    console.error("[rituals/morning/complete] auth_failed");
    return jsonResponse({ error: "unavailable" }, 503);
  }

  let claimsResult;

  try {
    claimsResult = await supabase.auth.getClaims();
  } catch {
    console.error("[rituals/morning/complete] auth_failed");
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const { data, error } = claimsResult;

  if (error || !data?.claims) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const userId =
    typeof data.claims.sub === "string" ? data.claims.sub : null;

  if (!userId) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  const briefingDate =
    body &&
    typeof body === "object" &&
    "briefingDate" in body &&
    typeof (body as { briefingDate: unknown }).briefingDate === "string"
      ? (body as { briefingDate: string }).briefingDate.trim()
      : "";

  if (!briefingDate || !isValidBriefingDate(briefingDate)) {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  let result;

  try {
    result = await completeMorningRitual({
      supabase,
      userId,
      briefingDate,
    });
  } catch {
    console.error("[rituals/morning/complete] complete_failed");
    return jsonResponse({ error: "unavailable" }, 503);
  }

  if (!result.success) {
    if (result.code === "invalid_request") {
      return jsonResponse({ error: "invalid_request" }, 400);
    }

    if (result.code === "not_started") {
      return jsonResponse({ error: "not_started" }, 404);
    }

    if (result.code === "briefing_mismatch") {
      return jsonResponse({ error: "briefing_mismatch" }, 409);
    }

    return jsonResponse({ error: "unavailable" }, 503);
  }

  return jsonResponse(
    {
      result: result.result,
      ritual: result.ritual,
    },
    200,
  );
}
