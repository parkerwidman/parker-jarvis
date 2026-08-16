import { NextRequest, NextResponse } from "next/server";

import {
  applyMorningRitualBypassCookie,
  isValidRitualDate,
} from "@/lib/jarvis/rituals/morning-ritual-bypass";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectWithoutBypass(request: NextRequest, pathname: string): NextResponse {
  return NextResponse.redirect(new URL(pathname, request.url), 303);
}

export async function POST(request: NextRequest) {
  let supabase;

  try {
    supabase = await createClient();
  } catch {
    return redirectWithoutBypass(request, "/wake");
  }

  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return redirectWithoutBypass(request, "/login");
  }

  const userId =
    typeof data.claims.sub === "string" ? data.claims.sub : null;

  if (!userId) {
    return redirectWithoutBypass(request, "/login");
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return redirectWithoutBypass(request, "/wake");
  }

  const ritualDate = String(formData.get("ritualDate") ?? "");

  if (!isValidRitualDate(ritualDate)) {
    return redirectWithoutBypass(request, "/wake");
  }

  const response = NextResponse.redirect(new URL("/", request.url), 303);
  applyMorningRitualBypassCookie(response.cookies, ritualDate);
  return response;
}
