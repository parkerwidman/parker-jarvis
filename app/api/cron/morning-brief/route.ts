import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { generateMorningBrief } from "@/lib/jarvis/briefings/generate-morning-brief";
import { createAutomationClient } from "@/lib/supabase/automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function authorizeCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    return false;
  }

  const expected = `Bearer ${cronSecret}`;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(authHeader);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.log("[morning-brief cron] configuration error");
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  if (!authorizeCronRequest(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const ownerUserId = process.env.JARVIS_OWNER_USER_ID;

  if (!ownerUserId || !UUID_REGEX.test(ownerUserId)) {
    console.log("[morning-brief cron] owner configuration error");
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  console.log("[morning-brief cron] starting");

  try {
    const supabase = createAutomationClient();
    const result = await generateMorningBrief(supabase, ownerUserId);

    if (!result.success) {
      console.log("[morning-brief cron] failed");
      return NextResponse.json(
        { success: false, status: "failed" },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    console.log("[morning-brief cron] succeeded");

    return NextResponse.json(
      {
        success: true,
        status: "completed",
        briefingDate: result.briefingDate,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    console.log("[morning-brief cron] failed");
    return NextResponse.json(
      { success: false, status: "failed" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
