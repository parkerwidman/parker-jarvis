import "server-only";

import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  METRICOOL_CLIENT_NAME,
  METRICOOL_CLIENT_VERSION,
  getMetricoolRedirectUri,
} from "./metricool-config";
import {
  deserializeClientInformation,
  deserializeOAuthTokens,
  loadMetricoolConnectionRow,
  saveMetricoolClientInformation,
  serializeClientInformation,
} from "./metricool-connection-tools";
import type { MetricoolConnectionRow } from "./metricool-types";

type MetricoolOAuthProviderOptions = {
  userId: string;
  supabase: SupabaseClient;
  redirectOrigin: string;
  connectionRow?: MetricoolConnectionRow | null;
};

/**
 * Server-side MCP OAuth provider for Metricool.
 * Persists dynamic client registration in encrypted DB storage and tokens after callback.
 * PKCE verifier and OAuth state live in short-lived HTTP-only cookies during the flow.
 */
export class MetricoolOAuthProvider implements OAuthClientProvider {
  private readonly userId: string;
  private readonly supabase: SupabaseClient;
  private readonly redirectOrigin: string;
  readonly redirectUrl: string;
  private connectionRow: MetricoolConnectionRow | null;
  private capturedAuthorizationUrl: URL | null = null;
  private pendingState?: string;
  private pendingCodeVerifier?: string;
  private inMemoryClientInformation?: OAuthClientInformationMixed;
  private inMemoryTokens?: OAuthTokens;

  constructor(options: MetricoolOAuthProviderOptions) {
    this.userId = options.userId;
    this.supabase = options.supabase;
    this.redirectOrigin = options.redirectOrigin;
    this.redirectUrl = getMetricoolRedirectUri(options.redirectOrigin);
    this.connectionRow = options.connectionRow ?? null;
    this.hydrateFromConnectionRow();
  }

  get clientMetadata() {
    return {
      client_name: METRICOOL_CLIENT_NAME,
      redirect_uris: [String(this.redirectUrl)],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none" as const,
    };
  }

  state(): string {
    if (!this.pendingState) {
      throw new Error("OAuth state has not been initialized");
    }
    return this.pendingState;
  }

  setPendingOAuthValues(state: string, codeVerifier: string): void {
    this.pendingState = state;
    this.pendingCodeVerifier = codeVerifier;
  }

  clientInformation():
    | OAuthClientInformationMixed
    | undefined
    | Promise<OAuthClientInformationMixed | undefined> {
    if (this.inMemoryClientInformation) {
      return this.inMemoryClientInformation;
    }

    const encrypted = this.connectionRow?.encrypted_client_information;
    if (!encrypted) {
      return undefined;
    }

    this.inMemoryClientInformation =
      deserializeClientInformation<OAuthClientInformationMixed>(encrypted);
    return this.inMemoryClientInformation;
  }

  async saveClientInformation(
    clientInformation: OAuthClientInformationMixed,
  ): Promise<void> {
    this.inMemoryClientInformation = clientInformation;
    const encrypted = serializeClientInformation(clientInformation);
    await saveMetricoolClientInformation(this.supabase, this.userId, encrypted);
  }

  tokens(): OAuthTokens | undefined | Promise<OAuthTokens | undefined> {
    if (this.inMemoryTokens) {
      return this.inMemoryTokens;
    }

    if (!this.connectionRow) {
      return undefined;
    }

    const stored = deserializeOAuthTokens(this.connectionRow);
    if (!stored) {
      return undefined;
    }

    this.inMemoryTokens = {
      access_token: stored.accessToken,
      refresh_token: stored.refreshToken,
      token_type: "Bearer",
    };
    return this.inMemoryTokens;
  }

  saveTokens(tokens: OAuthTokens): void | Promise<void> {
    this.inMemoryTokens = tokens;
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this.capturedAuthorizationUrl = authorizationUrl;
  }

  getAuthorizationUrl(): URL | null {
    return this.capturedAuthorizationUrl;
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.pendingCodeVerifier = codeVerifier;
  }

  codeVerifier(): string {
    if (!this.pendingCodeVerifier) {
      throw new Error("OAuth code verifier is unavailable");
    }
    return this.pendingCodeVerifier;
  }

  hydrateCodeVerifier(codeVerifier: string): void {
    this.pendingCodeVerifier = codeVerifier;
  }

  hydrateState(state: string): void {
    this.pendingState = state;
  }

  getSerializedTokens(): OAuthTokens | undefined {
    return this.inMemoryTokens;
  }

  async refreshConnectionRow(): Promise<void> {
    this.connectionRow = await loadMetricoolConnectionRow(
      this.supabase,
      this.userId,
    );
    this.hydrateFromConnectionRow();
  }

  private hydrateFromConnectionRow(): void {
    if (!this.connectionRow) {
      return;
    }

    if (this.connectionRow.encrypted_client_information) {
      this.inMemoryClientInformation =
        deserializeClientInformation<OAuthClientInformationMixed>(
          this.connectionRow.encrypted_client_information,
        );
    }

    const stored = deserializeOAuthTokens(this.connectionRow);
    if (stored) {
      this.inMemoryTokens = {
        access_token: stored.accessToken,
        refresh_token: stored.refreshToken,
        token_type: "Bearer",
      };
    }
  }
}
