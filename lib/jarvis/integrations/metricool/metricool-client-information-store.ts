import "server-only";

import type { OAuthClientInformationMixed } from "@modelcontextprotocol/sdk/shared/auth.js";

const ENVELOPE_VERSION = 2;

export type MetricoolClientInformationEnvelope = {
  version: typeof ENVELOPE_VERSION;
  clientsByRedirectUri: Record<string, OAuthClientInformationMixed>;
};

export function normalizeRedirectUri(uri: string): string {
  const url = new URL(uri);
  url.hash = "";
  url.search = "";

  const pathname =
    url.pathname.length > 1 && url.pathname.endsWith("/")
      ? url.pathname.slice(0, -1)
      : url.pathname;

  return `${url.protocol}//${url.host}${pathname}`;
}

function readRedirectUris(
  client: OAuthClientInformationMixed,
): string[] {
  const record = client as OAuthClientInformationMixed & {
    redirect_uris?: unknown;
  };

  if (!Array.isArray(record.redirect_uris)) {
    return [];
  }

  return record.redirect_uris
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => normalizeRedirectUri(entry));
}

export function clientInformationSupportsRedirectUri(
  client: OAuthClientInformationMixed,
  redirectUri: string,
): boolean {
  const normalizedRedirectUri = normalizeRedirectUri(redirectUri);
  const redirectUris = readRedirectUris(client);

  if (redirectUris.length === 0) {
    return false;
  }

  return redirectUris.includes(normalizedRedirectUri);
}

export function parseStoredClientInformationPayload(
  payload: unknown,
): MetricoolClientInformationEnvelope | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;

  if (
    record.version !== ENVELOPE_VERSION ||
    !record.clientsByRedirectUri ||
    typeof record.clientsByRedirectUri !== "object"
  ) {
    return null;
  }

  return {
    version: ENVELOPE_VERSION,
    clientsByRedirectUri: {
      ...(record.clientsByRedirectUri as Record<string, OAuthClientInformationMixed>),
    },
  };
}

export function loadClientInformationForRedirectUri(
  payload: unknown,
  redirectUri: string,
): OAuthClientInformationMixed | undefined {
  const normalizedRedirectUri = normalizeRedirectUri(redirectUri);
  const envelope = parseStoredClientInformationPayload(payload);

  if (envelope) {
    const client = envelope.clientsByRedirectUri[normalizedRedirectUri];
    if (client && clientInformationSupportsRedirectUri(client, redirectUri)) {
      return client;
    }
    return undefined;
  }

  const legacy = payload as OAuthClientInformationMixed | null;
  if (
    legacy &&
    typeof legacy === "object" &&
    "client_id" in legacy &&
    typeof legacy.client_id === "string" &&
    clientInformationSupportsRedirectUri(legacy, redirectUri)
  ) {
    return legacy;
  }

  return undefined;
}

export function mergeClientInformationForRedirectUri(
  existingPayload: unknown,
  redirectUri: string,
  clientInformation: OAuthClientInformationMixed,
): MetricoolClientInformationEnvelope {
  const normalizedRedirectUri = normalizeRedirectUri(redirectUri);
  const envelope = parseStoredClientInformationPayload(existingPayload) ?? {
    version: ENVELOPE_VERSION,
    clientsByRedirectUri: {},
  };

  const nextClients = { ...envelope.clientsByRedirectUri };

  const legacyEnvelope = !parseStoredClientInformationPayload(existingPayload)
    ? existingPayload
    : null;

  if (legacyEnvelope && typeof legacyEnvelope === "object") {
    const legacy = legacyEnvelope as OAuthClientInformationMixed;
    if (typeof legacy.client_id === "string") {
      for (const legacyRedirectUri of readRedirectUris(legacy)) {
        nextClients[legacyRedirectUri] = legacy;
      }
    }
  }

  nextClients[normalizedRedirectUri] = clientInformation;

  return {
    version: ENVELOPE_VERSION,
    clientsByRedirectUri: nextClients,
  };
}

export function summarizeStoredClientInformation(payload: unknown): {
  storageVersion: number | "legacy" | "missing";
  redirectUris: string[];
} {
  if (!payload) {
    return { storageVersion: "missing", redirectUris: [] };
  }

  const envelope = parseStoredClientInformationPayload(payload);
  if (envelope) {
    const redirectUris = Object.values(envelope.clientsByRedirectUri).flatMap(
      (client) => readRedirectUris(client),
    );
    return {
      storageVersion: ENVELOPE_VERSION,
      redirectUris: [...new Set(redirectUris)],
    };
  }

  const legacy = payload as OAuthClientInformationMixed;
  return {
    storageVersion: "legacy",
    redirectUris: readRedirectUris(legacy),
  };
}
