import { NextRequest, NextResponse } from "next/server";

import {
  buildMorningBriefAudioStoragePath,
  isMorningBriefAudioStoragePath,
  isValidBriefingDate,
  isValidContentHash,
  MORNING_BRIEF_AUDIO_BUCKET,
} from "@/lib/jarvis/audio/storage-path";
import { createAutomationClient } from "@/lib/supabase/automation";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const MORNING_BRIEF_AUDIO_SIGNED_URL_TTL_SECONDS = 90;

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

type BriefingAudioDeliveryRow = {
  audio_status: string;
  audio_content_hash: string | null;
  audio_storage_path: string | null;
};

function jsonResponse(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: PRIVATE_NO_STORE_HEADERS,
  });
}

function isReadyAudioMetadataValid(
  row: BriefingAudioDeliveryRow,
  userId: string,
  briefingDate: string,
): boolean {
  const contentHash = row.audio_content_hash;
  const storagePath = row.audio_storage_path;

  if (!contentHash || !isValidContentHash(contentHash)) {
    return false;
  }

  if (!storagePath) {
    return false;
  }

  if (!isMorningBriefAudioStoragePath(storagePath, userId, briefingDate)) {
    return false;
  }

  return (
    storagePath ===
    buildMorningBriefAudioStoragePath(userId, briefingDate, contentHash)
  );
}

export async function GET(request: NextRequest) {
  let supabase;

  try {
    supabase = await createClient();
  } catch {
    console.error("[briefings/audio] auth_failed");
    return jsonResponse({ error: "unavailable" }, 503);
  }

  let claimsResult;

  try {
    claimsResult = await supabase.auth.getClaims();
  } catch {
    console.error("[briefings/audio] auth_failed");
    return jsonResponse({ error: "unavailable" }, 503);
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

  const briefingDate = request.nextUrl.searchParams.get("briefingDate")?.trim() ?? "";

  if (!briefingDate || !isValidBriefingDate(briefingDate)) {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  let row;
  let rowError;

  try {
    const lookupResult = await supabase
      .from("morning_briefings")
      .select("audio_status, audio_content_hash, audio_storage_path")
      .eq("user_id", userId)
      .eq("briefing_date", briefingDate)
      .maybeSingle();
    row = lookupResult.data;
    rowError = lookupResult.error;
  } catch {
    console.error("[briefings/audio] briefing_lookup_failed");
    return jsonResponse({ error: "unavailable" }, 503);
  }

  if (rowError) {
    console.error("[briefings/audio] briefing_lookup_failed");
    return jsonResponse({ error: "unavailable" }, 503);
  }

  if (!row) {
    return jsonResponse({ error: "not_found" }, 404);
  }

  const audioStatus = row.audio_status;

  if (audioStatus === "ready") {
    if (!isReadyAudioMetadataValid(row, userId, briefingDate)) {
      console.error("[briefings/audio] signing_failed");
      return jsonResponse({ error: "unavailable" }, 503);
    }

    let automation;

    try {
      automation = createAutomationClient();
    } catch {
      console.error("[briefings/audio] signing_failed");
      return jsonResponse({ error: "unavailable" }, 503);
    }

    let signed;
    let signError;

    try {
      const signResult = await automation.storage
        .from(MORNING_BRIEF_AUDIO_BUCKET)
        .createSignedUrl(
          row.audio_storage_path!,
          MORNING_BRIEF_AUDIO_SIGNED_URL_TTL_SECONDS,
        );
      signed = signResult.data;
      signError = signResult.error;
    } catch {
      console.error("[briefings/audio] signing_failed");
      return jsonResponse({ error: "unavailable" }, 503);
    }

    if (signError || !signed?.signedUrl) {
      console.error("[briefings/audio] signing_failed");
      return jsonResponse({ error: "unavailable" }, 503);
    }

    return jsonResponse(
      {
        status: "ready",
        url: signed.signedUrl,
        expiresInSeconds: MORNING_BRIEF_AUDIO_SIGNED_URL_TTL_SECONDS,
      },
      200,
    );
  }

  if (audioStatus === "generating") {
    return jsonResponse({ status: "generating" }, 200);
  }

  if (audioStatus === "failed") {
    return jsonResponse({ status: "failed" }, 200);
  }

  if (audioStatus === "pending") {
    return jsonResponse({ status: "generating" }, 200);
  }

  return jsonResponse({ status: "unavailable" }, 200);
}
