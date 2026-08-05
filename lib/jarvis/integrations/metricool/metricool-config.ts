import "server-only";

export const METRICOOL_MCP_URL = "https://ai.metricool.com/mcp";

/** Trusted Melusi Metricool brand — never accept overrides from the browser. */
export const TRUSTED_BRAND_ID = "6543911";
export const TRUSTED_BRAND_LABEL = "melusiai";
export const TRUSTED_BRAND_TIMEZONE = "America/Chicago";

/** First date with meaningful Metricool history for Melusi — server-side only. */
export const METRICOOL_BRAND_HISTORY_START = "2026-07-12";

export const EXPECTED_CONNECTED_NETWORKS = [
  "instagram",
  "facebook",
  "linkedin",
  "tiktok",
  "twitter",
] as const;

export type ExpectedConnectedNetwork =
  (typeof EXPECTED_CONNECTED_NETWORKS)[number];

/** Read-only MCP tools permitted for this integration step. */
export const METRICOOL_READ_ONLY_TOOLS = [
  "getBrandSettings",
  "getAnalyticsAvailableMetrics",
  "getAnalyticsDataByMetrics",
  "getBestTimeToPostByNetwork",
  "getScheduledPosts",
] as const;

export type MetricoolReadOnlyToolName =
  (typeof METRICOOL_READ_ONLY_TOOLS)[number];

/** Explicitly denied write/scheduling tools — enforced in application code. */
export const METRICOOL_DENIED_TOOLS = [
  "createScheduledPost",
  "updateScheduledPost",
  "mcp_auth",
] as const;

export const METRICOOL_OAUTH_STATE_COOKIE = "metricool_oauth_state";
export const METRICOOL_OAUTH_VERIFIER_COOKIE = "metricool_oauth_verifier";
export const METRICOOL_OAUTH_COOKIE_MAX_AGE_SECONDS = 600;

export const METRICOOL_MCP_REQUEST_TIMEOUT_MS = 30_000;

export const METRICOOL_CLIENT_NAME = "Jarvis Melusi";
export const METRICOOL_CLIENT_VERSION = "1.0.0";

export function getMetricoolBaseUrl(fallbackOrigin: string): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || fallbackOrigin;
}

export function getMetricoolRedirectUri(fallbackOrigin: string): string {
  const configured = process.env.METRICOOL_REDIRECT_URI?.trim();
  if (configured) {
    return configured;
  }
  return `${getMetricoolBaseUrl(fallbackOrigin)}/api/integrations/metricool/callback`;
}

export function getMetricoolSocialRedirectPath(): string {
  return "/melusi/social";
}

export function isMetricoolReadOnlyTool(
  toolName: string,
): toolName is MetricoolReadOnlyToolName {
  return (METRICOOL_READ_ONLY_TOOLS as readonly string[]).includes(toolName);
}

export function isMetricoolDeniedTool(toolName: string): boolean {
  return (METRICOOL_DENIED_TOOLS as readonly string[]).includes(toolName);
}
