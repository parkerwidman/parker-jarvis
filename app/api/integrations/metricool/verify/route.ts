import { createClient } from "@/lib/supabase/server";
import {
  loadMetricoolProviderForUser,
  mapMetricoolError,
  verifyMetricoolConnection,
} from "@/lib/jarvis/integrations/metricool/metricool-client";
import {
  loadMetricoolConnectionRow,
  markMetricoolConnectionStatus,
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
  if (!row?.encrypted_access_token) {
    return NextResponse.json(
      { ok: false, error: "not_connected", status: "disconnected" },
      { status: 400 },
    );
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

    return NextResponse.json({
      ok: true,
      status: "connected",
      brandId: verifiedBrand.id,
      brandLabel: verifiedBrand.label,
      brandTimezone: verifiedBrand.timezone,
      connectedNetworks: verifiedBrand.connectedNetworks,
      lastVerifiedAt: new Date().toISOString(),
    });
  } catch (caught) {
    const safeError = mapMetricoolError(caught);
    const nextStatus =
      safeError.code === "auth_failed" ||
      safeError.code === "reconnect_required" ||
      safeError.code === "decryption_failed"
        ? "reconnect_required"
        : safeError.code === "brand_mismatch"
          ? "error"
          : "error";

    await markMetricoolConnectionStatus(
      supabase,
      userId,
      nextStatus,
      safeError.code,
    );

    return NextResponse.json(
      {
        ok: false,
        error: safeError.code,
        status: nextStatus,
      },
      { status: 400 },
    );
  }
}
