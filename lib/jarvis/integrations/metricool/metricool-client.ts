import "server-only";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EXPECTED_CONNECTED_NETWORKS,
  METRICOOL_CLIENT_NAME,
  METRICOOL_CLIENT_VERSION,
  METRICOOL_MCP_REQUEST_TIMEOUT_MS,
  METRICOOL_MCP_URL,
  TRUSTED_BRAND_ID,
  TRUSTED_BRAND_LABEL,
  TRUSTED_BRAND_TIMEZONE,
} from "./metricool-config";
import { MetricoolOAuthProvider } from "./metricool-oauth-provider";
import {
  callMetricoolReadOnlyTool,
  runMinimalReadOnlyProbe,
} from "./metricool-read-tools";
import { MetricoolSafeError, type MetricoolVerifiedBrand } from "./metricool-types";

const NETWORK_ALIASES: Record<string, string> = {
  x: "twitter",
};

const NETWORKS_DATA_FIELD_MAP: Record<string, string> = {
  instagramData: "instagram",
  facebookData: "facebook",
  linkedinData: "linkedin",
  tiktokData: "tiktok",
  twitterData: "twitter",
};

function isMeaningfulNetworkValue(value: unknown): boolean {
  if (value === null || value === undefined || value === false) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }

  return true;
}

function normalizeNetworkKey(value: string): string {
  const lowered = value.trim().toLowerCase();
  return NETWORK_ALIASES[lowered] ?? lowered;
}

function extractBrandId(record: Record<string, unknown>): string | null {
  for (const key of ["id", "brandId", "blogId", "blog_id"]) {
    const value = record[key];
    if (typeof value === "number") {
      return String(value);
    }
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function extractBrandLabel(record: Record<string, unknown>): string | null {
  for (const key of ["label", "name", "brandLabel", "brand_name", "blogName"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function extractBrandTimezone(record: Record<string, unknown>): string | null {
  for (const key of ["timezone", "timeZone", "tz"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function networkPresent(
  record: Record<string, unknown>,
  network: string,
): boolean {
  const direct = record[network];
  if (direct === true) {
    return true;
  }
  if (direct && typeof direct === "object") {
    return true;
  }

  const connectedKey = `${network}Connected`;
  if (record[connectedKey] === true) {
    return true;
  }

  const profileKey = `${network}Profile`;
  if (record[profileKey]) {
    return true;
  }

  return false;
}

function extractConnectedNetworks(
  record: Record<string, unknown>,
): { networks: string[]; profiles: Record<string, unknown> } {
  const networks = new Set<string>();
  const profiles: Record<string, unknown> = {};

  for (const network of EXPECTED_CONNECTED_NETWORKS) {
    if (networkPresent(record, network)) {
      networks.add(network);
      const profile = record[network];
      if (isMeaningfulNetworkValue(profile)) {
        profiles[network] = profile;
      }
    }
  }

  const networksData = record.networksData;
  if (
    networksData &&
    typeof networksData === "object" &&
    !Array.isArray(networksData)
  ) {
    for (const [fieldKey, network] of Object.entries(NETWORKS_DATA_FIELD_MAP)) {
      const profile = (networksData as Record<string, unknown>)[fieldKey];
      if (isMeaningfulNetworkValue(profile)) {
        networks.add(network);
        profiles[network] = profile;
      }
    }
  }

  for (const key of ["networks", "connectedNetworks", "providers", "socialNetworks"]) {
    const value = record[key];
    if (!Array.isArray(value)) {
      continue;
    }

    for (const entry of value) {
      if (typeof entry === "string") {
        networks.add(normalizeNetworkKey(entry));
        continue;
      }

      if (entry && typeof entry === "object") {
        const entryRecord = entry as Record<string, unknown>;
        const networkValue =
          entryRecord.network ??
          entryRecord.provider ??
          entryRecord.name ??
          entryRecord.type;

        if (typeof networkValue === "string") {
          const normalized = normalizeNetworkKey(networkValue);
          networks.add(normalized);
          profiles[normalized] = entryRecord;
        }
      }
    }
  }

  return {
    networks: [...networks],
    profiles,
  };
}

function parseBrandRecord(record: Record<string, unknown>) {
  const id = extractBrandId(record);
  const label = extractBrandLabel(record);
  const timezone = extractBrandTimezone(record);

  if (!id || !label || !timezone) {
    return null;
  }

  const { networks, profiles } = extractConnectedNetworks(record);

  return {
    id,
    label,
    timezone,
    connectedNetworks: networks,
    networkProfiles: profiles,
  };
}

function collectBrandCandidates(payload: unknown): Record<string, unknown>[] {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload.filter(
      (entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === "object",
    );
  }

  if (typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;

  for (const key of ["brands", "data", "items", "results"]) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      return nested.filter(
        (entry): entry is Record<string, unknown> =>
          !!entry && typeof entry === "object",
      );
    }
  }

  if (extractBrandId(record)) {
    return [record];
  }

  return [];
}

export function parseToolResultPayload(result: unknown): unknown {
  if (!result || typeof result !== "object") {
    return result;
  }

  const record = result as Record<string, unknown>;
  const content = record.content;

  if (!Array.isArray(content)) {
    return result;
  }

  for (const item of content) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const itemRecord = item as Record<string, unknown>;
    if (typeof itemRecord.text === "string") {
      try {
        return JSON.parse(itemRecord.text);
      } catch {
        return itemRecord.text;
      }
    }

    if (itemRecord.json) {
      return itemRecord.json;
    }
  }

  return result;
}

export function verifyTrustedMetricoolBrand(
  brandSettingsResult: unknown,
): MetricoolVerifiedBrand {
  const payload = parseToolResultPayload(brandSettingsResult);
  const candidates = collectBrandCandidates(payload);
  const trusted = candidates
    .map(parseBrandRecord)
    .find((brand) => brand?.id === TRUSTED_BRAND_ID);

  if (!trusted) {
    throw new MetricoolSafeError("brand_mismatch");
  }

  if (trusted.label.trim().toLowerCase() !== TRUSTED_BRAND_LABEL) {
    throw new MetricoolSafeError("brand_mismatch");
  }

  if (trusted.timezone !== TRUSTED_BRAND_TIMEZONE) {
    throw new MetricoolSafeError("brand_mismatch");
  }

  for (const network of EXPECTED_CONNECTED_NETWORKS) {
    if (!trusted.connectedNetworks.includes(network)) {
      throw new MetricoolSafeError("brand_mismatch");
    }
  }

  return trusted;
}

function createTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

export type MetricoolClientSession = {
  client: Client;
  close: () => Promise<void>;
};

export async function createMetricoolClientSession(
  provider: MetricoolOAuthProvider,
): Promise<MetricoolClientSession> {
  const transport = new StreamableHTTPClientTransport(
    new URL(METRICOOL_MCP_URL),
    {
      authProvider: provider,
      requestInit: {
        signal: createTimeoutSignal(METRICOOL_MCP_REQUEST_TIMEOUT_MS),
      },
    },
  );

  const client = new Client({
    name: METRICOOL_CLIENT_NAME,
    version: METRICOOL_CLIENT_VERSION,
  });

  try {
    await client.connect(transport);
  } catch (error) {
    await transport.close().catch(() => undefined);

    if (error instanceof UnauthorizedError) {
      throw new MetricoolSafeError("auth_failed");
    }

    throw new MetricoolSafeError("network_failure");
  }

  return {
    client,
    close: async () => {
      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
    },
  };
}

export async function verifyMetricoolConnection(
  provider: MetricoolOAuthProvider,
  options: { runReadProbe?: boolean } = {},
): Promise<MetricoolVerifiedBrand> {
  const session = await createMetricoolClientSession(provider);

  try {
    const brandSettings = await callMetricoolReadOnlyTool(
      session.client,
      "getBrandSettings",
    );
    const verifiedBrand = verifyTrustedMetricoolBrand(brandSettings);

    if (options.runReadProbe) {
      await runMinimalReadOnlyProbe(session.client);
    }

    return verifiedBrand;
  } finally {
    await session.close();
  }
}

export async function finishMetricoolOAuthAndVerify(
  provider: MetricoolOAuthProvider,
  authorizationCode: string,
): Promise<MetricoolVerifiedBrand> {
  const transport = new StreamableHTTPClientTransport(
    new URL(METRICOOL_MCP_URL),
    {
      authProvider: provider,
      requestInit: {
        signal: createTimeoutSignal(METRICOOL_MCP_REQUEST_TIMEOUT_MS),
      },
    },
  );

  try {
    await transport.finishAuth(authorizationCode);
  } catch {
    await transport.close().catch(() => undefined);
    throw new MetricoolSafeError("auth_failed");
  } finally {
    await transport.close().catch(() => undefined);
  }

  return verifyMetricoolConnection(provider, { runReadProbe: true });
}

export async function loadMetricoolProviderForUser(
  supabase: SupabaseClient,
  userId: string,
  redirectOrigin: string,
): Promise<MetricoolOAuthProvider> {
  const { loadMetricoolConnectionRow } = await import(
    "./metricool-connection-tools"
  );
  const row = await loadMetricoolConnectionRow(supabase, userId);

  return new MetricoolOAuthProvider({
    userId,
    supabase,
    redirectOrigin,
    connectionRow: row,
  });
}

export function mapMetricoolError(error: unknown): MetricoolSafeError {
  if (error instanceof MetricoolSafeError) {
    return error;
  }

  if (error instanceof UnauthorizedError) {
    return new MetricoolSafeError("reconnect_required");
  }

  return new MetricoolSafeError("connection_failed");
}
