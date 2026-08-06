import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const linkTokenCreateMock = vi.fn();

vi.mock("plaid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("plaid")>();

  class MockPlaidApi {
    linkTokenCreate = linkTokenCreateMock;
  }

  return {
    ...actual,
    PlaidApi: MockPlaidApi,
  };
});

import {
  createLinkToken,
  resetPlaidClientCacheForTests,
} from "@/lib/jarvis/integrations/plaid/plaid-client";
import {
  getPlaidEnvironment,
  validatePlaidCredentials,
} from "@/lib/jarvis/integrations/plaid/plaid-config";
import {
  isPlaidLinkTokenPlaidApiFailure,
  isPlaidLinkTokenPrePlaidFailure,
  linkTokenFailureHttpStatus,
  logPlaidLinkTokenDiagnostic,
  mapPlaidSafeErrorToLinkTokenDiagnostic,
  resolvePlaidLinkTokenDiagnosticCode,
} from "@/lib/jarvis/integrations/plaid/plaid-link-token-errors";
import { PlaidSafeError } from "@/lib/jarvis/integrations/plaid/plaid-types";

const ENV_KEYS = [
  "PLAID_ENV",
  "PLAID_CLIENT_ID",
  "PLAID_SECRET",
  "VERCEL_ENV",
] as const;

type EnvSnapshot = Record<(typeof ENV_KEYS)[number], string | undefined>;

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

describe("plaid link-token diagnostics", () => {
  let envSnapshot: EnvSnapshot;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
    resetPlaidClientCacheForTests();
    linkTokenCreateMock.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
    resetPlaidClientCacheForTests();
    vi.unstubAllGlobals();
  });

  it("maps missing credentials to missing_server_configuration with HTTP 500", () => {
    delete process.env.PLAID_CLIENT_ID;
    delete process.env.PLAID_SECRET;

    expect(() => validatePlaidCredentials()).toThrow(PlaidSafeError);
    expect(() => validatePlaidCredentials()).toThrowError(
      expect.objectContaining({ code: "missing_server_configuration" }),
    );

    const code = resolvePlaidLinkTokenDiagnosticCode(
      new PlaidSafeError("missing_server_configuration"),
    );
    expect(code).toBe("missing_server_configuration");
    expect(linkTokenFailureHttpStatus(code)).toBe(500);
    expect(isPlaidLinkTokenPrePlaidFailure(code)).toBe(true);
    expect(isPlaidLinkTokenPlaidApiFailure(code)).toBe(false);
  });

  it("maps invalid runtime environment to a safe diagnostic code", () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.PLAID_ENV;

    expect(() => getPlaidEnvironment()).toThrowError(
      expect.objectContaining({ code: "invalid_runtime_environment" }),
    );

    const code = mapPlaidSafeErrorToLinkTokenDiagnostic(
      new PlaidSafeError("invalid_runtime_environment"),
    );
    expect(code).toBe("invalid_runtime_environment");
    expect(linkTokenFailureHttpStatus(code)).toBe(500);
  });

  it("maps generic failures to connection_failed", () => {
    const code = resolvePlaidLinkTokenDiagnosticCode(new Error("unexpected"));
    expect(code).toBe("connection_failed");
    expect(linkTokenFailureHttpStatus(code)).toBe(400);
  });

  it("maps Plaid API failures to plaid_request_failed", () => {
    const code = mapPlaidSafeErrorToLinkTokenDiagnostic(new PlaidSafeError("plaid_error"));
    expect(code).toBe("plaid_request_failed");
    expect(linkTokenFailureHttpStatus(code)).toBe(400);
    expect(isPlaidLinkTokenPlaidApiFailure(code)).toBe(true);
    expect(isPlaidLinkTokenPrePlaidFailure(code)).toBe(false);
  });

  it("logs only the generic diagnostic code", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logPlaidLinkTokenDiagnostic("missing_server_configuration");

    expect(errorSpy).toHaveBeenCalledWith("[plaid-link-token]", {
      error: "missing_server_configuration",
    });
  });

  it("reaches the Plaid client for valid production configuration", async () => {
    process.env.PLAID_ENV = "production";
    process.env.PLAID_CLIENT_ID = "client-id";
    process.env.PLAID_SECRET = "secret";

    linkTokenCreateMock.mockResolvedValue({
      data: {
        link_token: "link-production-token",
        expiration: "2026-08-07T00:00:00Z",
      },
    });

    const result = await createLinkToken("user-123");

    expect(linkTokenCreateMock).toHaveBeenCalledOnce();
    expect(result.linkToken).toBe("link-production-token");
  });

  it("reaches the Plaid client for valid sandbox configuration", async () => {
    process.env.PLAID_ENV = "sandbox";
    process.env.PLAID_CLIENT_ID = "client-id";
    process.env.PLAID_SECRET = "secret";

    linkTokenCreateMock.mockResolvedValue({
      data: {
        link_token: "link-sandbox-token",
        expiration: "2026-08-07T00:00:00Z",
      },
    });

    const result = await createLinkToken("user-123");

    expect(linkTokenCreateMock).toHaveBeenCalledOnce();
    expect(result.linkToken).toBe("link-sandbox-token");
  });

  it("does not reach Plaid when server configuration is missing", async () => {
    process.env.PLAID_ENV = "production";
    delete process.env.PLAID_CLIENT_ID;
    delete process.env.PLAID_SECRET;

    await expect(createLinkToken("user-123")).rejects.toMatchObject({
      code: "missing_server_configuration",
    });
  });

  it("distinguishes Plaid API errors from pre-Plaid rejections", async () => {
    process.env.PLAID_ENV = "sandbox";
    process.env.PLAID_CLIENT_ID = "client-id";
    process.env.PLAID_SECRET = "secret";

    linkTokenCreateMock.mockRejectedValue({
      response: {
        status: 400,
        data: {
          error_code: "INVALID_FIELD",
          error_type: "INVALID_REQUEST",
        },
      },
    });

    await expect(createLinkToken("user-123")).rejects.toMatchObject({
      code: "update_failed",
    });

    const prePlaidCode = resolvePlaidLinkTokenDiagnosticCode(
      new PlaidSafeError("missing_server_configuration"),
    );
    const plaidApiCode = resolvePlaidLinkTokenDiagnosticCode(
      new PlaidSafeError("plaid_error"),
    );

    expect(isPlaidLinkTokenPrePlaidFailure(prePlaidCode)).toBe(true);
    expect(isPlaidLinkTokenPlaidApiFailure(plaidApiCode)).toBe(true);
  });

  it("does not expose secrets or private identifiers in diagnostic codes", () => {
    const responseBody = {
      ok: false,
      error: resolvePlaidLinkTokenDiagnosticCode(
        new PlaidSafeError("missing_server_configuration"),
      ),
    };

    expect(JSON.stringify(responseBody)).not.toMatch(/secret|token|user|cookie|header/i);
    expect(responseBody.error).toBe("missing_server_configuration");
  });

  it("maps invalid origin to HTTP 403 without weakening other protections", () => {
    const code = mapPlaidSafeErrorToLinkTokenDiagnostic(new PlaidSafeError("invalid_origin"));
    expect(code).toBe("invalid_origin");
    expect(linkTokenFailureHttpStatus(code)).toBe(403);
    expect(linkTokenFailureHttpStatus("missing_server_configuration")).toBe(500);
    expect(linkTokenFailureHttpStatus("unauthenticated")).toBe(401);
  });

  it("validates credentials before the mocked Plaid client is used", async () => {
    process.env.PLAID_ENV = "production";
    delete process.env.PLAID_CLIENT_ID;
    delete process.env.PLAID_SECRET;

    await expect(createLinkToken("user-123")).rejects.toMatchObject({
      code: "missing_server_configuration",
    });
    expect(linkTokenCreateMock).not.toHaveBeenCalled();
  });
});

describe("plaid link-token auth expectations", () => {
  it("uses unauthenticated as the safe rejection code", () => {
    expect(linkTokenFailureHttpStatus("unauthenticated")).toBe(401);
    expect(resolvePlaidLinkTokenDiagnosticCode(new PlaidSafeError("unauthorized"))).toBe(
      "connection_failed",
    );
  });
});
