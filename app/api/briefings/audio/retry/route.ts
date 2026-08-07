import { NextRequest, NextResponse } from "next/server";

import { generateMorningBriefAudio } from "@/lib/jarvis/briefings/generate-morning-brief-audio";
import { isValidBriefingDate } from "@/lib/jarvis/audio/storage-path";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

type RetryResponseStatus = "ready" | "generating" | "failed";

type BriefingRetryRow = {
  content: string | null;
  status: string;
};

function jsonResponse(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: PRIVATE_NO_STORE_HEADERS,
  });
}

function mapGenerationResultToRetryStatus(
  resultCode: string,
): RetryResponseStatus {
  if (resultCode === "already_ready" || resultCode === "ready") {
    return "ready";
  }

  if (resultCode === "generation_in_progress") {
    return "generating";
  }

  return "failed";
}

export async function POST(request: NextRequest) {
  let supabase;

  try {
    supabase = await createClient();
  } catch {
    console.error("[briefings/audio/retry] auth_failed");
    return jsonResponse({ status: "failed" }, 503);
  }

  let claimsResult;

  try {
    claimsResult = await supabase.auth.getClaims();
  } catch {
    console.error("[briefings/audio/retry] auth_failed");
    return jsonResponse({ status: "failed" }, 503);
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

  let row: BriefingRetryRow | null;
  let rowError;

  try {
    const lookupResult = await supabase
      .from("morning_briefings")
      .select("content, status")
      .eq("user_id", userId)
      .eq("briefing_date", briefingDate)
      .maybeSingle();
    row = lookupResult.data as BriefingRetryRow | null;
    rowError = lookupResult.error;
  } catch {
    console.error("[briefings/audio/retry] briefing_lookup_failed");
    return jsonResponse({ status: "failed" }, 503);
  }

  if (rowError) {
    console.error("[briefings/audio/retry] briefing_lookup_failed");
    return jsonResponse({ status: "failed" }, 503);
  }

  if (!row) {
    return jsonResponse({ error: "not_found" }, 404);
  }

  const storedContent = row.content?.trim() ?? "";

  if (row.status !== "completed" || !storedContent) {
    return jsonResponse({ status: "failed" }, 200);
  }

  let generationResult;

  try {
    generationResult = await generateMorningBriefAudio({
      userId,
      briefingDate,
      normalizedSpokenContent: storedContent,
    });
  } catch {
    console.error("[briefings/audio/retry] generation_failed");
    return jsonResponse({ status: "failed" }, 503);
  }

  return jsonResponse(
    { status: mapGenerationResultToRetryStatus(generationResult.resultCode) },
    200,
  );
}
