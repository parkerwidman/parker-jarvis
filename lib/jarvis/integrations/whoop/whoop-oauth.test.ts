import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as connectGET } from "@/app/api/integrations/whoop/connect/route";
import { GET as callbackGET } from "@/app/api/integrations/whoop/callback/route";
import { POST as disconnectPOST } from "@/app/api/integrations/whoop/disconnect/route";
import {
  WHOOP_REQUESTED_SCOPES,
  WHOOP_SCOPES_STRING,
  getWhoopRedirectUri,
  WHOOP_AUTHORIZE_URL,
  WHOOP_TOKEN_URL,
  WHOOP_API_BASE,
  WHOOP_PROFILE_PATH,
} from "@/lib/jarvis/integrations/whoop/whoop-config";
import {
  buildWhoopAuthorizeUrl,
  decodeWhoopOAuthStateCookie,
  encodeWhoopOAuthStateCookie,
  generateWhoopOAuthState,
  isWhoopOAuthStateExpired,
  sanitizeWhoopProviderError,
  whoopOAuthStatesMatch,
  WHOOP_OAUTH_STATE_COOKIE,
  WHOOP_OAUTH_COOKIE_PATH,
  clearWhoopOAuthStateCookie,
} from "@/lib/jarvis/integrations/whoop/whoop-oauth-state";
import {
  exchangeWhoopAuthorizationCode,
  fetchWhoopBasicProfile,
  normalizeWhoopExpiresIn,
  refreshWhoopTokenPair,
} from "@/lib/jarvis/integrations/whoop/whoop-oauth-client";
import {
  WHOOP_OAUTH_ERROR_CODES,
  WhoopOAuthError,
} from "@/lib/jarvis/integrations/whoop/whoop-oauth-errors";
import {
  encryptWhoopAccessToken,
  encryptWhoopRefreshToken,
} from "@/lib/jarvis/integrations/whoop/whoop-token-crypto";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TEST_ENCRYPTION_KEY = "aa".repeat(32);

const ENV_KEYS = [
  "WHOOP_CLIENT_ID",
  "WHOOP_CLIENT_SECRET",
  "WHOOP_TOKEN_ENCRYPTION_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "NODE_ENV",
] as const;

const getClaimsMock = vi.fn();
const cookiesGetMock = vi.fn();
const fetchMock = vi.fn();
const persistWhoopOAuthConnectionMock = vi.fn();
const executeWhoopDisconnectMock = vi.fn();
const revokeWhoopAccessMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
  })),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: cookiesGetMock,
  })),
}));

vi.mock("@/lib/jarvis/integrations/whoop/whoop-connection-tools", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/jarvis/integrations/whoop/whoop-connection-tools")
  >("@/lib/jarvis/integrations/whoop/whoop-connection-tools");

  return {
    ...actual,
    persistWhoopOAuthConnection: (...args: unknown[]) =>
      persistWhoopOAuthConnectionMock(...args),
  };
});

vi.mock("@/lib/jarvis/integrations/whoop/whoop-disconnect-service", () => ({
  executeWhoopDisconnect: (...args: unknown[]) =>
    executeWhoopDisconnectMock(...args),
}));

vi.mock("@/lib/jarvis/integrations/whoop/whoop-oauth-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/jarvis/integrations/whoop/whoop-oauth-client")
  >("@/lib/jarvis/integrations/whoop/whoop-oauth-client");

  return {
    ...actual,
    revokeWhoopAccess: (...args: unknown[]) => revokeWhoopAccessMock(...args),
  };
});

const ROOT = resolve(import.meta.dirname, "../../../..");

function snapshotEnv(): Record<string, string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function setWhoopEnv(): void {
  process.env.WHOOP_CLIENT_ID = "whoop-client-id";
  process.env.WHOOP_CLIENT_SECRET = "whoop-client-secret";
  process.env.WHOOP_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  process.env.NEXT_PUBLIC_SITE_URL = "https://parker-jarvis-pw.vercel.app";
  process.env.NODE_ENV = "test";
}

function buildAuthenticatedClaims(): void {
  getClaimsMock.mockResolvedValue({
    data: { claims: { sub: USER_ID } },
    error: null,
  });
}

function buildUnauthenticatedClaims(): void {
  getClaimsMock.mockResolvedValue({
    data: { claims: null },
    error: new Error("unauthenticated"),
  });
}

function readRedirectLocation(response: Response): URL {
  const location = response.headers.get("location");
  expect(location).toBeTruthy();
  return new URL(location!);
}

function extractCookieValue(
  setCookieHeader: string,
  cookieName: string,
): string | null {
  const prefix = `${cookieName}=`;
  const segment = setCookieHeader
    .split(/,(?=[^;]+?=)/)
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!segment) {
    return null;
  }

  const value = segment.slice(prefix.length).split(";")[0];
  return value.length > 0 ? value : null;
}

describe("WHOOP OAuth config and state", () => {
  beforeEach(() => {
    setWhoopEnv();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests exact required scopes including offline", () => {
    expect(WHOOP_REQUESTED_SCOPES).toEqual([
      "offline",
      "read:recovery",
      "read:cycles",
      "read:sleep",
      "read:workout",
      "read:profile",
      "read:body_measurement",
    ]);
    expect(WHOOP_SCOPES_STRING).toContain("offline");
  });

  it("resolves production redirect URI from canonical site URL", () => {
    expect(getWhoopRedirectUri("http://localhost:3000")).toBe(
      "https://parker-jarvis-pw.vercel.app/api/integrations/whoop/callback",
    );
  });

  it("generates state exactly eight characters", () => {
    const state = generateWhoopOAuthState();
    expect(state).toHaveLength(8);
    expect(state).toMatch(/^[A-Za-z0-9]{8}$/);
  });

  it("stores and validates OAuth state cookie payload", () => {
    const payload = {
      state: generateWhoopOAuthState(),
      userId: USER_ID,
      issuedAt: Date.now(),
    };

    const encoded = encodeWhoopOAuthStateCookie(payload);
    const decoded = decodeWhoopOAuthStateCookie(encoded);

    expect(decoded).toEqual(payload);
    expect(whoopOAuthStatesMatch(payload.state, payload.state)).toBe(true);
    expect(whoopOAuthStatesMatch(payload.state, "00000000")).toBe(false);
  });

  it("builds authorization URL with required params", () => {
    const url = buildWhoopAuthorizeUrl({
      clientId: "whoop-client-id",
      redirectUri:
        "https://parker-jarvis-pw.vercel.app/api/integrations/whoop/callback",
      state: "Ab12Cd34",
    });

    expect(url.origin + url.pathname).toBe(WHOOP_AUTHORIZE_URL);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("whoop-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://parker-jarvis-pw.vercel.app/api/integrations/whoop/callback",
    );
    expect(url.searchParams.get("scope")).toBe(WHOOP_SCOPES_STRING);
    expect(url.searchParams.get("state")).toBe("Ab12Cd34");
  });

  it("uses OAuth cookie path scoped to WHOOP routes", () => {
    expect(WHOOP_OAUTH_COOKIE_PATH).toBe("/api/integrations/whoop");
  });

  it("sanitizes provider error descriptions", () => {
    expect(sanitizeWhoopProviderError("access_denied")).toBe("access_denied");
    expect(sanitizeWhoopProviderError("<script>alert(1)</script>")).toBeNull();
  });
});

describe("WHOOP connect route", () => {
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
    setWhoopEnv();
    vi.clearAllMocks();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("requires authentication", async () => {
    buildUnauthenticatedClaims();

    const response = await connectGET(
      new NextRequest("https://parker-jarvis-pw.vercel.app/api/integrations/whoop/connect"),
    );

    expect(response.status).toBe(307);
    expect(readRedirectLocation(response).pathname).toBe("/login");
  });

  it("redirects to WHOOP and stores state cookie", async () => {
    buildAuthenticatedClaims();

    const response = await connectGET(
      new NextRequest("https://parker-jarvis-pw.vercel.app/api/integrations/whoop/connect"),
    );

    const location = readRedirectLocation(response);
    expect(location.origin + location.pathname).toBe(WHOOP_AUTHORIZE_URL);
    expect(location.searchParams.get("scope")).toBe(WHOOP_SCOPES_STRING);

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${WHOOP_OAUTH_STATE_COOKIE}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain(`Path=${WHOOP_OAUTH_COOKIE_PATH}`);

    const cookieValue = extractCookieValue(setCookie, WHOOP_OAUTH_STATE_COOKIE);
    expect(cookieValue).toBeTruthy();

    const decoded = decodeWhoopOAuthStateCookie(cookieValue!);
    expect(decoded?.userId).toBe(USER_ID);
    expect(decoded?.state).toHaveLength(8);
    expect(location.searchParams.get("state")).toBe(decoded?.state);
  });
});

describe("WHOOP callback route", () => {
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
    setWhoopEnv();
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("requires authentication", async () => {
    buildUnauthenticatedClaims();

    const response = await callbackGET(
      new NextRequest(
        "https://parker-jarvis-pw.vercel.app/api/integrations/whoop/callback?code=abc&state=12345678",
      ),
    );

    expect(readRedirectLocation(response).pathname).toBe("/login");
  });

  it("rejects state mismatch and clears cookie", async () => {
    buildAuthenticatedClaims();

    const pending = {
      state: "Ab12Cd34",
      userId: USER_ID,
      issuedAt: Date.now(),
    };

    cookiesGetMock.mockReturnValue({
      value: encodeWhoopOAuthStateCookie(pending),
    });

    const response = await callbackGET(
      new NextRequest(
        "https://parker-jarvis-pw.vercel.app/api/integrations/whoop/callback?code=abc&state=00000000",
      ),
    );

    const location = readRedirectLocation(response);
    expect(location.pathname).toBe("/integrations/whoop");
    expect(location.searchParams.get("status")).toBe("error");
    expect(response.headers.get("set-cookie")).toContain(
      `${WHOOP_OAUTH_STATE_COOKIE}=;`,
    );
  });

  it("rejects provider errors safely", async () => {
    buildAuthenticatedClaims();

    const response = await callbackGET(
      new NextRequest(
        "https://parker-jarvis-pw.vercel.app/api/integrations/whoop/callback?error=access_denied&error_description=denied",
      ),
    );

    const location = readRedirectLocation(response);
    expect(location.searchParams.get("status")).toBe("error");
    expect(location.search).not.toContain("denied");
  });

  it("redirects with token_exchange_failed without provider diagnostics", async () => {
    buildAuthenticatedClaims();
    global.fetch = fetchMock;
    fetchMock.mockReset();

    const pending = {
      state: "Ab12Cd34",
      userId: USER_ID,
      issuedAt: Date.now(),
    };

    cookiesGetMock.mockReturnValue({
      value: encodeWhoopOAuthStateCookie(pending),
    });

    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: "invalid_grant",
        error_description: "client_secret=super-secret authorization_code=abc123",
      }),
    });

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await callbackGET(
      new NextRequest(
        `https://parker-jarvis-pw.vercel.app/api/integrations/whoop/callback?code=secret-auth-code&state=${pending.state}`,
      ),
    );

    const location = readRedirectLocation(response);
    expect(location.searchParams.get("status")).toBe("error");
    expect(location.searchParams.get("error")).toBe("token_exchange_failed");
    expect(location.search).not.toContain("invalid_grant");
    expect(location.search).not.toContain("client_secret");
    expect(location.search).not.toContain("secret-auth-code");

    consoleErrorSpy.mockRestore();
  });
});

describe("WHOOP OAuth client endpoints", () => {
  const oauthClientSource = readFileSync(
    resolve(
      import.meta.dirname,
      "whoop-oauth-client.ts",
    ),
    "utf8",
  );
  const connectionToolsSource = readFileSync(
    resolve(import.meta.dirname, "whoop-connection-tools.ts"),
    "utf8",
  );
  const callbackRouteSource = readFileSync(
    resolve(ROOT, "app/api/integrations/whoop/callback/route.ts"),
    "utf8",
  );

  it("uses token endpoint with form encoding", () => {
    expect(oauthClientSource).toContain("WHOOP_TOKEN_URL");
    expect(oauthClientSource).toContain(
      "application/x-www-form-urlencoded",
    );
    expect(oauthClientSource).toContain("grant_type");
    expect(oauthClientSource).toContain("authorization_code");
    expect(oauthClientSource).toContain("refresh_token");
  });

  it("uses v2 profile endpoint with Bearer token", () => {
    expect(oauthClientSource).toContain("WHOOP_PROFILE_PATH");
    expect(oauthClientSource).toContain("Authorization");
    expect(oauthClientSource).toContain("Bearer");
    expect(`${WHOOP_API_BASE}${WHOOP_PROFILE_PATH}`).toBe(
      "https://api.prod.whoop.com/developer/v2/user/profile/basic",
    );
  });

  it("encrypts tokens before persistence and keeps safe row token-free", () => {
    expect(connectionToolsSource).toContain("encryptWhoopAccessToken");
    expect(connectionToolsSource).toContain("encryptWhoopRefreshToken");
    expect(connectionToolsSource).toContain("whoop_upsert_oauth_connection");
    expect(callbackRouteSource).not.toContain("console.log");
    expect(callbackRouteSource).not.toContain("access_token");
    expect(callbackRouteSource).not.toContain("refresh_token");
  });

  it("uses revoke endpoint for disconnect", () => {
    expect(oauthClientSource).toContain("WHOOP_REVOKE_PATH");
    expect(oauthClientSource).toContain("method: \"DELETE\"");
    expect(oauthClientSource).toContain("response.status === 204");
  });
});

describe("WHOOP disconnect route", () => {
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
    setWhoopEnv();
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("requires authentication", async () => {
    buildUnauthenticatedClaims();

    const response = await disconnectPOST(
      new NextRequest("https://parker-jarvis-pw.vercel.app/api/integrations/whoop/disconnect", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns disconnected on successful disconnect", async () => {
    buildAuthenticatedClaims();
    executeWhoopDisconnectMock.mockResolvedValue({
      ok: true,
      status: "disconnected",
    });

    const response = await disconnectPOST(
      new NextRequest("https://parker-jarvis-pw.vercel.app/api/integrations/whoop/disconnect", {
        method: "POST",
      }),
    );
    const payload = (await response.json()) as { ok: boolean; status?: string };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.status).toBe("disconnected");
    expect(JSON.stringify(payload)).not.toContain("access-token");
  });

  it("does not falsely report success on cleanup-pending disconnect failure", async () => {
    buildAuthenticatedClaims();
    executeWhoopDisconnectMock.mockResolvedValue({
      ok: false,
      error: "whoop_disconnect_cleanup_pending",
      status: "cleanup_pending",
      httpStatus: 503,
    });

    const response = await disconnectPOST(
      new NextRequest("https://parker-jarvis-pw.vercel.app/api/integrations/whoop/disconnect", {
        method: "POST",
      }),
    );
    const payload = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(503);
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("whoop_disconnect_cleanup_pending");
    expect(JSON.stringify(payload)).not.toContain(
      "remote_revoke_local_cleanup_pending",
    );
  });
});

describe("WHOOP OAuth state expiry", () => {
  it("expires state after cookie max age", () => {
    const issuedAt = Date.now() - 601_000;
    expect(isWhoopOAuthStateExpired(issuedAt)).toBe(true);
  });
});

describe("WHOOP token encryption at rest", () => {
  beforeEach(() => {
    process.env.WHOOP_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  });

  it("encrypts access and refresh tokens before storage helpers run", () => {
    const access = encryptWhoopAccessToken("access-plain");
    const refresh = encryptWhoopRefreshToken("refresh-plain");

    expect(access).not.toContain("access-plain");
    expect(refresh).not.toContain("refresh-plain");
  });
});

describe("WHOOP OAuth cookie clearing helper", () => {
  it("clears state cookie on response", () => {
    const response = NextResponse.redirect("https://example.com");
    clearWhoopOAuthStateCookie(response);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${WHOOP_OAUTH_STATE_COOKIE}=;`);
    expect(setCookie).toContain("Max-Age=0");
  });
});

describe("WHOOP OAuth live client helpers with fetch mock", () => {
  beforeEach(() => {
    setWhoopEnv();
    global.fetch = fetchMock;
    fetchMock.mockReset();
  });

  it("exchanges authorization code via form-encoded token endpoint", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "access-new",
        refresh_token: "refresh-new",
        expires_in: 3600,
        scope: WHOOP_SCOPES_STRING,
        token_type: "Bearer",
      }),
    });

    const tokenPair = await exchangeWhoopAuthorizationCode({
      code: "auth-code",
      redirectUri:
        "https://parker-jarvis-pw.vercel.app/api/integrations/whoop/callback",
    });

    expect(tokenPair.accessToken).toBe("access-new");
    expect(tokenPair.refreshToken).toBe("refresh-new");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(WHOOP_TOKEN_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(String(init.body)).toContain("grant_type=authorization_code");
    expect(String(init.body)).toContain("client_id=whoop-client-id");
  });

  it("rejects invalid profile responses", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ user_id: "not-a-number" }),
    });

    await expect(fetchWhoopBasicProfile("token")).rejects.toThrow();
  });

  it("refresh rotates both tokens", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "access-rotated",
        refresh_token: "refresh-rotated",
        expires_in: 3600,
        scope: "offline",
      }),
    });

    const tokenPair = await refreshWhoopTokenPair("refresh-old");
    expect(tokenPair.accessToken).toBe("access-rotated");
    expect(tokenPair.refreshToken).toBe("refresh-rotated");
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain(
      "grant_type=refresh_token",
    );
  });

  it("treats 204 revoke as success", async () => {
    fetchMock.mockResolvedValue({ status: 204, ok: false });
    const { revokeWhoopAccess: actualRevokeWhoopAccess } = await vi.importActual<
      typeof import("@/lib/jarvis/integrations/whoop/whoop-oauth-client")
    >("@/lib/jarvis/integrations/whoop/whoop-oauth-client");

    await expect(actualRevokeWhoopAccess("token")).resolves.toEqual({
      success: true,
      alreadyRevoked: false,
    });
  });
});

describe("WHOOP token request diagnostics and parsing", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setWhoopEnv();
    global.fetch = fetchMock;
    fetchMock.mockReset();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  function expectSafeDiagnosticLogged(expected: {
    operation: "token_exchange" | "token_refresh";
    httpStatus: number;
    oauthErrorCode: string;
  }): void {
    const diagnosticCall = consoleErrorSpy.mock.calls.find(
      ([label, payload]) =>
        label === "[whoop-oauth]" &&
        typeof payload === "object" &&
        payload !== null &&
        "operation" in payload,
    );

    expect(diagnosticCall?.[1]).toEqual({
      integration: "whoop",
      operation: expected.operation,
      httpStatus: expected.httpStatus,
      oauthErrorCode: expected.oauthErrorCode,
    });
  }

  function expectNoSecretsLogged(): void {
    for (const call of consoleErrorSpy.mock.calls) {
      const serialized = JSON.stringify(call);
      expect(serialized).not.toContain("error_description");
      expect(serialized).not.toContain("client_secret");
      expect(serialized).not.toContain("authorization_code");
      expect(serialized).not.toContain("secret-auth-code");
      expect(serialized).not.toContain("access-token-value");
      expect(serialized).not.toContain("refresh-token-value");
      expect(serialized).not.toContain("super-secret");
      expect(serialized).not.toContain("raw provider");
    }
  }

  it("logs safe diagnostic for HTTP 400 invalid_grant", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: "invalid_grant",
        error_description: "secret details",
      }),
    });

    await expect(
      exchangeWhoopAuthorizationCode({
        code: "secret-auth-code",
        redirectUri:
          "https://parker-jarvis-pw.vercel.app/api/integrations/whoop/callback",
      }),
    ).rejects.toMatchObject({
      code: WHOOP_OAUTH_ERROR_CODES.tokenExchangeFailed,
      providerHttpStatus: 400,
      providerOAuthErrorCode: "invalid_grant",
    });

    expectSafeDiagnosticLogged({
      operation: "token_exchange",
      httpStatus: 400,
      oauthErrorCode: "invalid_grant",
    });
    expectNoSecretsLogged();
  });

  it("logs safe diagnostic for HTTP 401 invalid_client", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: "invalid_client",
        error_description: "client_secret mismatch",
      }),
    });

    await expect(
      exchangeWhoopAuthorizationCode({
        code: "secret-auth-code",
        redirectUri:
          "https://parker-jarvis-pw.vercel.app/api/integrations/whoop/callback",
      }),
    ).rejects.toMatchObject({
      providerHttpStatus: 401,
      providerOAuthErrorCode: "invalid_client",
    });

    expectSafeDiagnosticLogged({
      operation: "token_exchange",
      httpStatus: 401,
      oauthErrorCode: "invalid_client",
    });
    expectNoSecretsLogged();
  });

  it("maps unknown provider errors to unknown_oauth_error", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: "unexpected_provider_code",
        error_description: "something else",
      }),
    });

    await expect(
      exchangeWhoopAuthorizationCode({
        code: "secret-auth-code",
        redirectUri:
          "https://parker-jarvis-pw.vercel.app/api/integrations/whoop/callback",
      }),
    ).rejects.toMatchObject({
      providerOAuthErrorCode: "unknown_oauth_error",
    });

    expectSafeDiagnosticLogged({
      operation: "token_exchange",
      httpStatus: 400,
      oauthErrorCode: "unknown_oauth_error",
    });
    expectNoSecretsLogged();
  });

  it("preserves HTTP status for malformed non-JSON provider failures", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("invalid json");
      },
    });

    await expect(
      exchangeWhoopAuthorizationCode({
        code: "secret-auth-code",
        redirectUri:
          "https://parker-jarvis-pw.vercel.app/api/integrations/whoop/callback",
      }),
    ).rejects.toMatchObject({
      providerHttpStatus: 502,
      providerOAuthErrorCode: "unknown_oauth_error",
    });

    expectSafeDiagnosticLogged({
      operation: "token_exchange",
      httpStatus: 502,
      oauthErrorCode: "unknown_oauth_error",
    });
    expectNoSecretsLogged();
  });

  it("identifies refresh diagnostics separately from token exchange", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid_grant" }),
    });

    await expect(refreshWhoopTokenPair("refresh-token-value")).rejects.toMatchObject(
      {
        code: WHOOP_OAUTH_ERROR_CODES.tokenRefreshFailed,
        providerHttpStatus: 400,
        providerOAuthErrorCode: "invalid_grant",
      },
    );

    expectSafeDiagnosticLogged({
      operation: "token_refresh",
      httpStatus: 400,
      oauthErrorCode: "invalid_grant",
    });
    expectNoSecretsLogged();
  });

  it("accepts numeric expires_in", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "access-token-value",
        refresh_token: "refresh-token-value",
        expires_in: 3600,
      }),
    });

    const tokenPair = await exchangeWhoopAuthorizationCode({
      code: "secret-auth-code",
      redirectUri:
        "https://parker-jarvis-pw.vercel.app/api/integrations/whoop/callback",
    });

    expect(tokenPair.expiresIn).toBe(3600);
  });

  it("accepts string expires_in and normalizes to number", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "access-token-value",
        refresh_token: "refresh-token-value",
        expires_in: "3600",
      }),
    });

    const tokenPair = await exchangeWhoopAuthorizationCode({
      code: "secret-auth-code",
      redirectUri:
        "https://parker-jarvis-pw.vercel.app/api/integrations/whoop/callback",
    });

    expect(tokenPair.expiresIn).toBe(3600);
    expect(typeof tokenPair.expiresIn).toBe("number");
  });

  it("rejects invalid expires_in values", async () => {
    for (const expiresIn of ["", "abc", "0", "-1", "36.5", Number.NaN, null]) {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "access-token-value",
          refresh_token: "refresh-token-value",
          expires_in: expiresIn,
        }),
      });

      await expect(
        exchangeWhoopAuthorizationCode({
          code: "secret-auth-code",
          redirectUri:
            "https://parker-jarvis-pw.vercel.app/api/integrations/whoop/callback",
        }),
      ).rejects.toBeInstanceOf(WhoopOAuthError);
    }
  });

  it("does not log successful token response fields", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "access-token-value",
        refresh_token: "refresh-token-value",
        expires_in: 3600,
      }),
    });

    await exchangeWhoopAuthorizationCode({
      code: "secret-auth-code",
      redirectUri:
        "https://parker-jarvis-pw.vercel.app/api/integrations/whoop/callback",
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});

describe("WHOOP expires_in normalization helper", () => {
  it("normalizes valid numeric and string values", () => {
    expect(normalizeWhoopExpiresIn(3600)).toBe(3600);
    expect(normalizeWhoopExpiresIn("3600")).toBe(3600);
  });

  it("rejects invalid values", () => {
    expect(normalizeWhoopExpiresIn("")).toBeNull();
    expect(normalizeWhoopExpiresIn("abc")).toBeNull();
    expect(normalizeWhoopExpiresIn(0)).toBeNull();
    expect(normalizeWhoopExpiresIn(-1)).toBeNull();
    expect(normalizeWhoopExpiresIn("36.5")).toBeNull();
    expect(normalizeWhoopExpiresIn(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
