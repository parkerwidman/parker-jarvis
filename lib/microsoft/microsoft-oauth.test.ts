import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as connectGET } from "@/app/api/microsoft/connect/route";
import { GET as callbackGET } from "@/app/api/microsoft/callback/route";
import {
  buildMicrosoftAuthorizeUrl,
  decodeMicrosoftOAuthStateCookie,
  encodeMicrosoftOAuthStateCookie,
  generateMicrosoftOAuthNonce,
  isAllowedMicrosoftOAuthReturnPath,
  isMicrosoftOAuthStateExpired,
  microsoftConnectionsResultUrl,
  microsoftOAuthStatesMatch,
  MICROSOFT_OAUTH_RESULT,
  MICROSOFT_OAUTH_STATE_COOKIE,
  parseMicrosoftConnectMode,
  resolvePersistedGrantedScopes,
  resolveReconnectSuccessResult,
} from "@/lib/microsoft/oauth-state";
import {
  grantedScopesIncludeMailSend,
  MICROSOFT_GRANTED_SCOPES_UNKNOWN,
  MICROSOFT_MAIL_SEND_SCOPE,
  MICROSOFT_OAUTH_SCOPES,
  MICROSOFT_SCOPES_STRING,
  resolveMailSendPermissionState,
} from "@/lib/microsoft/scopes";
import {
  getMailSendPermissionState,
  userHasMailSendPermission,
} from "@/lib/microsoft/token-manager";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TEST_ENCRYPTION_KEY = "aa".repeat(32);

const ENV_KEYS = [
  "MICROSOFT_TENANT_ID",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_REDIRECT_URI",
  "MICROSOFT_TOKEN_ENCRYPTION_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "NODE_ENV",
] as const;

type EnvSnapshot = Record<(typeof ENV_KEYS)[number], string | undefined>;

const getClaimsMock = vi.fn();
const fromMock = vi.fn();
const fetchMock = vi.fn();
const cookiesGetMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
    from: fromMock,
  })),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: cookiesGetMock,
  })),
}));

function snapshotEnv(): EnvSnapshot {
  return Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as EnvSnapshot;
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function setOAuthEnv(): void {
  process.env.MICROSOFT_TENANT_ID = "tenant-id";
  process.env.MICROSOFT_CLIENT_ID = "client-id";
  process.env.MICROSOFT_CLIENT_SECRET = "client-secret";
  process.env.MICROSOFT_REDIRECT_URI = "https://jarvis.example/api/microsoft/callback";
  process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  process.env.NEXT_PUBLIC_SITE_URL = "https://jarvis.example";
  process.env.NODE_ENV = "test";
}

function buildAuthenticatedClaims() {
  getClaimsMock.mockResolvedValue({
    data: { claims: { sub: USER_ID } },
    error: null,
  });
}

function buildUnauthenticatedClaims() {
  getClaimsMock.mockResolvedValue({
    data: { claims: null },
    error: new Error("unauthenticated"),
  });
}

function buildConnectRequest(query = ""): NextRequest {
  return new NextRequest(`https://jarvis.example/api/microsoft/connect${query}`);
}

function buildCallbackRequest(query: string): NextRequest {
  return new NextRequest(`https://jarvis.example/api/microsoft/callback${query}`);
}

function readRedirectLocation(response: Response): URL {
  const location = response.headers.get("location");
  expect(location).toBeTruthy();
  return new URL(location!);
}

function readSetCookieHeader(response: Response): string {
  return response.headers.get("set-cookie") ?? "";
}

function extractCookieValue(setCookieHeader: string, cookieName: string): string | null {
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

function buildPendingStateCookie(mode: "connect" | "reconnect" = "connect") {
  const nonce = generateMicrosoftOAuthNonce();
  const payload = encodeMicrosoftOAuthStateCookie({
    state: nonce,
    userId: USER_ID,
    mode,
    issuedAt: Date.now(),
  });

  cookiesGetMock.mockReturnValue({ value: payload });
  return nonce;
}

function mockExistingConnection(grantedScopes: string | null) {
  const upsert = vi.fn(async () => ({ error: null }));

  fromMock.mockImplementation((table: string) => {
    if (table !== "microsoft_connections") {
      throw new Error(`Unexpected table ${table}`);
    }

    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: grantedScopes ? { granted_scopes: grantedScopes } : null,
            error: null,
          })),
        })),
      })),
      upsert,
    };
  });

  return { upsert };
}

describe("microsoft oauth scopes", () => {
  it("uses one centralized scope list that includes Mail.Send", () => {
    expect(MICROSOFT_OAUTH_SCOPES).toContain(MICROSOFT_MAIL_SEND_SCOPE);
    expect(MICROSOFT_SCOPES_STRING).toContain("Mail.Send");
  });
});

describe("microsoft oauth state helpers", () => {
  let envSnapshot: EnvSnapshot;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
    setOAuthEnv();
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("stores reconnect intent inside the signed oauth state cookie", () => {
    const nonce = generateMicrosoftOAuthNonce();
    const encoded = encodeMicrosoftOAuthStateCookie({
      state: nonce,
      userId: USER_ID,
      mode: "reconnect",
      issuedAt: Date.now(),
    });

    const decoded = decodeMicrosoftOAuthStateCookie(encoded);
    expect(decoded).toMatchObject({
      state: nonce,
      userId: USER_ID,
      mode: "reconnect",
    });
  });

  it("rejects expired oauth state", () => {
    expect(isMicrosoftOAuthStateExpired(Date.now() - 601_000)).toBe(true);
    expect(isMicrosoftOAuthStateExpired(Date.now())).toBe(false);
  });

  it("compares oauth state nonces safely", () => {
    const nonce = generateMicrosoftOAuthNonce();
    expect(microsoftOAuthStatesMatch(nonce, nonce)).toBe(true);
    expect(microsoftOAuthStatesMatch(nonce, `${nonce}x`)).toBe(false);
  });

  it("replaces stale stored scopes when reconnect returns explicit scopes", () => {
    expect(
      resolvePersistedGrantedScopes({
        tokenScope: "Mail.ReadWrite Mail.Send",
        existingGrantedScopes: "Mail.ReadWrite",
        mode: "reconnect",
      }),
    ).toBe("Mail.ReadWrite Mail.Send");
  });

  it("stores unknown grant state when reconnect token response omits scope", () => {
    expect(
      resolvePersistedGrantedScopes({
        tokenScope: undefined,
        existingGrantedScopes: "Mail.ReadWrite Calendars.ReadWrite",
        mode: "reconnect",
      }),
    ).toBe(MICROSOFT_GRANTED_SCOPES_UNKNOWN);
  });

  it("does not assume Mail.Send was granted when connect token response omits scope", () => {
    expect(
      resolvePersistedGrantedScopes({
        tokenScope: undefined,
        existingGrantedScopes: null,
        mode: "connect",
      }),
    ).toBe(MICROSOFT_GRANTED_SCOPES_UNKNOWN);
  });

  it("resolves reconnect redirect results for granted, missing, and unknown Mail.Send", () => {
    expect(resolveReconnectSuccessResult("granted")).toBe(
      MICROSOFT_OAUTH_RESULT.reconnected,
    );
    expect(resolveReconnectSuccessResult("missing")).toBe(
      MICROSOFT_OAUTH_RESULT.reconnectedMailSendMissing,
    );
    expect(resolveReconnectSuccessResult("unknown")).toBe(
      MICROSOFT_OAUTH_RESULT.reconnectedMailSendUnknown,
    );
  });

  it("restricts oauth return destinations to the microsoft connections page", () => {
    expect(isAllowedMicrosoftOAuthReturnPath("/connections/microsoft")).toBe(true);
    expect(isAllowedMicrosoftOAuthReturnPath("/finance/plaid")).toBe(false);
  });
});

describe("microsoft connect route", () => {
  let envSnapshot: EnvSnapshot;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
    setOAuthEnv();
    vi.clearAllMocks();
    buildAuthenticatedClaims();
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("rejects unauthenticated reconnect attempts", async () => {
    buildUnauthenticatedClaims();

    const response = await connectGET(buildConnectRequest("?mode=reconnect"));

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(readRedirectLocation(response).pathname).toBe("/login");
  });

  it("starts normal connect without forcing consent", async () => {
    const response = await connectGET(buildConnectRequest());
    const location = readRedirectLocation(response);

    expect(location.hostname).toBe("login.microsoftonline.com");
    expect(location.searchParams.get("scope")).toBe(MICROSOFT_SCOPES_STRING);
    expect(location.searchParams.get("prompt")).toBeNull();

    const cookieValue = extractCookieValue(
      readSetCookieHeader(response),
      MICROSOFT_OAUTH_STATE_COOKIE,
    );
    expect(decodeMicrosoftOAuthStateCookie(cookieValue!)).toMatchObject({
      userId: USER_ID,
      mode: "connect",
    });
  });

  it("starts explicit reconnect even when already connected", async () => {
    const response = await connectGET(buildConnectRequest("?mode=reconnect"));
    const location = readRedirectLocation(response);

    expect(parseMicrosoftConnectMode(location.searchParams)).toBe("connect");
    expect(
      parseMicrosoftConnectMode(new URL("https://x?mode=reconnect").searchParams),
    ).toBe("reconnect");
    expect(location.searchParams.get("prompt")).toBe("consent");
    expect(location.searchParams.get("scope")).toBe(MICROSOFT_SCOPES_STRING);

    const cookieValue = extractCookieValue(
      readSetCookieHeader(response),
      MICROSOFT_OAUTH_STATE_COOKIE,
    );
    expect(decodeMicrosoftOAuthStateCookie(cookieValue!)).toMatchObject({
      mode: "reconnect",
    });
  });

  it("rejects arbitrary return urls", async () => {
    const response = await connectGET(
      buildConnectRequest("?return=/finance/plaid"),
    );
    const location = readRedirectLocation(response);

    expect(location.pathname).toBe("/connections/microsoft");
    expect(location.searchParams.get("result")).toBe(
      MICROSOFT_OAUTH_RESULT.connectionFailed,
    );
  });

  it("builds reconnect authorization urls with consent prompt only for reconnect", () => {
    const connectUrl = buildMicrosoftAuthorizeUrl({
      tenantId: "tenant-id",
      clientId: "client-id",
      redirectUri: "https://jarvis.example/api/microsoft/callback",
      state: "nonce",
      mode: "connect",
    });
    const reconnectUrl = buildMicrosoftAuthorizeUrl({
      tenantId: "tenant-id",
      clientId: "client-id",
      redirectUri: "https://jarvis.example/api/microsoft/callback",
      state: "nonce",
      mode: "reconnect",
    });

    expect(connectUrl.searchParams.get("prompt")).toBeNull();
    expect(reconnectUrl.searchParams.get("prompt")).toBe("consent");
  });
});

describe("microsoft callback route", () => {
  let envSnapshot: EnvSnapshot;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
    setOAuthEnv();
    vi.clearAllMocks();
    buildAuthenticatedClaims();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
    vi.unstubAllGlobals();
  });

  it("preserves the existing connection when consent is cancelled", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    fromMock.mockReturnValue({ upsert, select: vi.fn() });

    const response = await callbackGET(
      buildCallbackRequest("?error=access_denied&state=ignored"),
    );
    const location = readRedirectLocation(response);

    expect(location.searchParams.get("result")).toBe(
      MICROSOFT_OAUTH_RESULT.consentCancelled,
    );
    expect(upsert).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves the existing connection when oauth state is invalid", async () => {
    const { upsert } = mockExistingConnection("Mail.ReadWrite Calendars.ReadWrite");

    cookiesGetMock.mockReturnValue(undefined);

    const response = await callbackGET(
      buildCallbackRequest("?code=secret-code&state=bad-state"),
    );

    expect(readRedirectLocation(response).searchParams.get("result")).toBe(
      MICROSOFT_OAUTH_RESULT.invalidOAuthState,
    );
    expect(upsert).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("updates tokens only after a successful reconnect exchange", async () => {
    const nonce = buildPendingStateCookie("reconnect");
    const { upsert } = mockExistingConnection("Mail.ReadWrite Calendars.ReadWrite");

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 3600,
          scope: "Mail.ReadWrite Mail.Send Calendars.ReadWrite",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "ms-user-id",
          displayName: "Parker",
          mail: "parker@example.com",
        }),
      });

    const response = await callbackGET(
      buildCallbackRequest(`?code=oauth-code&state=${nonce}`),
    );
    const location = readRedirectLocation(response);

    expect(location.searchParams.get("result")).toBe(
      MICROSOFT_OAUTH_RESULT.reconnected,
    );
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0]?.[0]).toMatchObject({
      granted_scopes: "Mail.ReadWrite Mail.Send Calendars.ReadWrite",
    });
  });

  it("stores unknown grant state when reconnect exchange omits scope", async () => {
    const nonce = buildPendingStateCookie("reconnect");
    const { upsert } = mockExistingConnection("Mail.ReadWrite Calendars.ReadWrite");

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 3600,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "ms-user-id",
          displayName: "Parker",
          mail: "parker@example.com",
        }),
      });

    const response = await callbackGET(
      buildCallbackRequest(`?code=oauth-code&state=${nonce}`),
    );

    expect(readRedirectLocation(response).searchParams.get("result")).toBe(
      MICROSOFT_OAUTH_RESULT.reconnectedMailSendUnknown,
    );
    expect(upsert.mock.calls[0]?.[0]).toMatchObject({
      granted_scopes: MICROSOFT_GRANTED_SCOPES_UNKNOWN,
    });
  });

  it("redirects to missing-permission result when reconnect scopes exclude Mail.Send", async () => {
    const nonce = buildPendingStateCookie("reconnect");
    mockExistingConnection("Mail.ReadWrite Mail.Send Calendars.ReadWrite");

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 3600,
          scope: "Mail.ReadWrite Calendars.ReadWrite",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "ms-user-id",
          displayName: "Parker",
          mail: "parker@example.com",
        }),
      });

    const response = await callbackGET(
      buildCallbackRequest(`?code=oauth-code&state=${nonce}`),
    );

    expect(readRedirectLocation(response).searchParams.get("result")).toBe(
      MICROSOFT_OAUTH_RESULT.reconnectedMailSendMissing,
    );
  });

  it("does not expose tokens, codes, or raw errors in redirect results", async () => {
    const nonce = buildPendingStateCookie("connect");
    mockExistingConnection(null);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: "invalid_grant",
        error_description: "Top secret oauth failure",
      }),
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await callbackGET(
      buildCallbackRequest(`?code=oauth-code&state=${nonce}`),
    );
    const location = readRedirectLocation(response);
    const serialized = `${location.href} ${logSpy.mock.calls.join(" ")} ${errorSpy.mock.calls.join(" ")}`;

    expect(location.searchParams.get("result")).toBe(
      MICROSOFT_OAUTH_RESULT.connectionFailed,
    );
    expect(serialized).not.toContain("oauth-code");
    expect(serialized).not.toContain("new-access-token");
    expect(serialized).not.toContain("Top secret oauth failure");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("mail.send capability detection", () => {
  it("detects Mail.Send from refreshed grants", () => {
    expect(grantedScopesIncludeMailSend("Mail.ReadWrite Mail.Send")).toBe(true);
  });

  it("continues to treat old grants without Mail.Send as missing permission", () => {
    expect(grantedScopesIncludeMailSend("Mail.ReadWrite Calendars.ReadWrite")).toBe(
      false,
    );
    expect(resolveMailSendPermissionState("Mail.ReadWrite Calendars.ReadWrite")).toBe(
      "missing",
    );
  });

  it("treats empty granted scopes as unknown permission", () => {
    expect(resolveMailSendPermissionState(MICROSOFT_GRANTED_SCOPES_UNKNOWN)).toBe(
      "unknown",
    );
  });

  it("checks stored granted scopes through token-manager", async () => {
    fromMock.mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: { granted_scopes: "Mail.ReadWrite Calendars.ReadWrite" },
            error: null,
          })),
        })),
      })),
    }));

    await expect(
      getMailSendPermissionState({ from: fromMock } as never, USER_ID),
    ).resolves.toBe("missing");
    await expect(
      userHasMailSendPermission({ from: fromMock } as never, USER_ID),
    ).resolves.toBe(false);
  });
});

describe("microsoft connections page", () => {
  it("shows reconnect for connected users and connect for disconnected users", () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), "app/connections/microsoft/page.tsx"),
      "utf8",
    );

    expect(pageSource).toContain("Reconnect Microsoft");
    expect(pageSource).toContain('/api/microsoft/connect?mode=reconnect');
    expect(pageSource).toContain("Connect Microsoft 365");
    expect(pageSource).toContain('href="/api/microsoft/connect"');
    expect(pageSource).toContain("Microsoft permissions updated.");
    expect(pageSource).toContain("Email permission will be verified when Jarvis");
    expect(pageSource).toContain("email sending permission was not granted");
    expect(pageSource).toContain("Your existing connection is still available");
  });
});

describe("microsoft oauth redirect helpers", () => {
  it("uses privacy-safe result codes on the connections page", () => {
    const url = microsoftConnectionsResultUrl(
      "https://jarvis.example",
      MICROSOFT_OAUTH_RESULT.reconnected,
    );

    expect(url.pathname).toBe("/connections/microsoft");
    expect(url.searchParams.get("result")).toBe("microsoft_reconnected");
  });
});
