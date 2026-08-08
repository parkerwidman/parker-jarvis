import { NextRequest, NextResponse } from "next/server";

import {
  MORNING_BRIEF_TIMELINE_ERROR_CODE_VALUES,
  type MorningBriefTimelineErrorCode,
} from "@/lib/jarvis/briefings/audio-timeline-types";
import {
  ensureMorningBriefAudioTimeline,
  type EnsureMorningBriefAudioTimelineResult,
} from "@/lib/jarvis/briefings/ensure-morning-brief-audio-timeline";
import { isValidBriefingDate } from "@/lib/jarvis/audio/storage-path";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

type BriefingTimelineEnsureRow = {
  status: string;
  audio_status: string;
};

function jsonResponse(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: PRIVATE_NO_STORE_HEADERS,
  });
}

function isTimelineErrorCode(
  value: string,
): value is MorningBriefTimelineErrorCode {
  return (MORNING_BRIEF_TIMELINE_ERROR_CODE_VALUES as readonly string[]).includes(
    value,
  );
}

function mapEnsureResultToResponse(
  result: EnsureMorningBriefAudioTimelineResult,
): NextResponse {
  if (result.resultCode === "ready") {
    return jsonResponse(
      {
        status: "ready",
        reused: result.reused,
        durationMs: result.durationMs,
        sentenceCount: result.timeline.sentences.length,
      },
      200,
    );
  }

  if (isTimelineErrorCode(result.resultCode)) {
    return jsonResponse(
      {
        status: "failed",
        error: result.resultCode,
      },
      200,
    );
  }

  console.error("[briefings/audio/timeline/ensure] ensure_unexpected_result");
  return jsonResponse({ error: "unavailable" }, 503);
}

export async function POST(request: NextRequest) {
  let supabase;

  try {
    supabase = await createClient();
  } catch {
    console.error("[briefings/audio/timeline/ensure] auth_failed");
    return jsonResponse({ error: "unavailable" }, 503);
  }

  let claimsResult;

  try {
    claimsResult = await supabase.auth.getClaims();
  } catch {
    console.error("[briefings/audio/timeline/ensure] auth_failed");
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

  let row: BriefingTimelineEnsureRow | null;
  let rowError;

  try {
    const lookupResult = await supabase
      .from("morning_briefings")
      .select("status, audio_status")
      .eq("user_id", userId)
      .eq("briefing_date", briefingDate)
      .maybeSingle();
    row = lookupResult.data as BriefingTimelineEnsureRow | null;
    rowError = lookupResult.error;
  } catch {
    console.error("[briefings/audio/timeline/ensure] briefing_lookup_failed");
    return jsonResponse({ error: "unavailable" }, 503);
  }

  if (rowError) {
    console.error("[briefings/audio/timeline/ensure] briefing_lookup_failed");
    return jsonResponse({ error: "unavailable" }, 503);
  }

  if (!row) {
    return jsonResponse({ error: "not_found" }, 404);
  }

  if (row.status !== "completed") {
    return jsonResponse({ error: "unavailable" }, 409);
  }

  if (row.audio_status !== "ready") {
    return jsonResponse({ error: "audio_not_ready" }, 409);
  }

  let ensureResult: EnsureMorningBriefAudioTimelineResult;

  try {
    ensureResult = await ensureMorningBriefAudioTimeline({
      userId,
      briefingDate,
    });
  } catch {
    console.error("[briefings/audio/timeline/ensure] ensure_failed");
    return jsonResponse({ error: "unavailable" }, 503);
  }

  return mapEnsureResultToResponse(ensureResult);
}
