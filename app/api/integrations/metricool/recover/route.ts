import { createClient } from "@/lib/supabase/server";
import {
  loadMetricoolProviderForUser,
  mapMetricoolError,
  verifyMetricoolConnection,
} from "@/lib/jarvis/integrations/metricool/metricool-client";
import {
  clearInterruptedMetricoolConnection,
  hasUsableMetricoolCredentials,
  isRecoverableConnectingState,
  loadMetricoolConnectionRow,
  loadSafeMetricoolConnection,
  markMetricoolConnectionStatus,
  toSafeMetricoolConnection,
  updateMetricoolVerifiedMetadata,
} from "@/lib/jarvis/integrations/metricool/metricool-connection-tools";
import { NextRequest, NextResponse } from "next/server";

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

  const row = await loadMetricoolConnectionRow(supabase, userId);

  if (!isRecoverableConnectingState(row)) {
    return NextResponse.json(
      { ok: false, error: "not_recoverable", status: row?.status ?? "disconnected" },
      { status: 400 },
    );
  }

  if (!hasUsableMetricoolCredentials(row)) {
    await clearInterruptedMetricoolConnection(supabase, userId);
    const connection = await loadSafeMetricoolConnection(supabase, userId);

    return NextResponse.json({
      ok: true,
      recovered: true,
      status: "disconnected",
      connection,
    });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;

  const provider = await loadMetricoolProviderForUser(
    supabase,
    userId,
    baseUrl,
  );

  try {
    const verifiedBrand = await verifyMetricoolConnection(provider, {
      runReadProbe: true,
    });

    await updateMetricoolVerifiedMetadata(supabase, userId, {
      brandId: verifiedBrand.id,
      brandLabel: verifiedBrand.label,
      brandTimezone: verifiedBrand.timezone,
      connectedNetworks: verifiedBrand.networkProfiles,
      status: "connected",
    });

    const connection = await loadSafeMetricoolConnection(supabase, userId);

    return NextResponse.json({
      ok: true,
      recovered: true,
      status: "connected",
      connection,
      brandId: verifiedBrand.id,
      brandLabel: verifiedBrand.label,
      brandTimezone: verifiedBrand.timezone,
      connectedNetworks: verifiedBrand.connectedNetworks,
      lastVerifiedAt: connection.lastVerifiedAt,
    });
  } catch (caught) {
    const safeError = mapMetricoolError(caught);
    const nextStatus =
      safeError.code === "auth_failed" ||
      safeError.code === "reconnect_required" ||
      safeError.code === "decryption_failed"
        ? "reconnect_required"
        : "error";

    await markMetricoolConnectionStatus(
      supabase,
      userId,
      nextStatus,
      safeError.code,
    );

    const connection = toSafeMetricoolConnection(
      row
        ? {
            ...row,
            status: nextStatus,
            last_error_code: safeError.code,
          }
        : null,
    );

    return NextResponse.json(
      {
        ok: false,
        recovered: true,
        error: safeError.code,
        status: nextStatus,
        connection,
      },
      { status: 400 },
    );
  }
}
