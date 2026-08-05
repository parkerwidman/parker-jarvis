import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSafeMetricoolConnection } from "@/lib/jarvis/integrations/metricool/metricool-connection-tools";
import {
  loadMetricoolSocialDashboard,
  summarizeSocialSnapshotForAgent,
} from "@/lib/jarvis/integrations/metricool/metricool-social-dashboard";
import {
  isTrustedNetworkFilter,
} from "@/lib/jarvis/integrations/metricool/metricool-metric-catalog";
import type { SocialNetworkKey } from "@/lib/jarvis/integrations/metricool/metricool-social-types";
import type { SocialPerformanceFocus } from "@/lib/jarvis/integrations/metricool/metricool-social-types";

function resolveRedirectOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
}

function parseFocus(value: unknown): SocialPerformanceFocus {
  if (typeof value !== "string") {
    return "overview";
  }

  switch (value) {
    case "overview":
    case "network":
    case "content":
    case "schedule":
    case "alerts":
      return value;
    default:
      return "overview";
  }
}

function parseNetwork(value: unknown): SocialNetworkKey | undefined {
  if (typeof value !== "string" || !isTrustedNetworkFilter(value)) {
    return undefined;
  }

  return value;
}

export async function getMelusiSocialPerformance(
  supabase: SupabaseClient,
  userId: string,
  args: {
    focus?: unknown;
    network?: unknown;
  },
): Promise<Record<string, unknown>> {
  const connection = await loadSafeMetricoolConnection(supabase, userId);

  if (connection.status !== "connected") {
    return {
      success: false,
      error:
        connection.status === "reconnect_required"
          ? "Metricool authorization needs to be renewed before social analytics can be loaded."
          : "Metricool is not connected. Connect Metricool on the Social Command Center page first.",
      connectionStatus: connection.status,
    };
  }

  const focus = parseFocus(args.focus);
  const network = focus === "network" ? parseNetwork(args.network) : undefined;

  if (focus === "network" && !network) {
    return {
      success: false,
      error:
        "Network focus requires a trusted network value: instagram, facebook, linkedin, tiktok, or twitter.",
    };
  }

  const result = await loadMetricoolSocialDashboard(
    supabase,
    userId,
    resolveRedirectOrigin(),
  );

  if (!result.ok) {
    return {
      success: false,
      error: result.message,
      connectionStatus: result.connection.status,
      errorCode: result.errorCode,
    };
  }

  return summarizeSocialSnapshotForAgent(result.snapshot, focus, network);
}
