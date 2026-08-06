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
  extractSafePlaidApiError,
  formatPlaidLinkTokenClientError,
  isPlaidLinkTokenPlaidApiFailure,
  isPlaidLinkTokenPrePlaidFailure,
  linkTokenFailureHttpStatus,
  logPlaidLinkTokenDiagnostic,
  mapPlaidSafeErrorToLinkTokenDiagnostic,
  resolvePlaidLinkTokenDiagnosticCode,
  resolvePlaidLinkTokenFailure,
  sanitizePlaidDiagnosticToken,
  UNKNOWN_PLAID_ERROR,
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

function buildPlaidAxiosError({
  status = 400,
  errorType,
  errorCode,
  errorMessage,
  requestId,
}: {
  status?: number;
  errorType: string;
  errorCode: string;
  errorMessage?: string;
  requestId?: string;
}) {
  return {
    response: {
      status,
      data: {
        error_type: errorType,
        error_code: errorCode,
        error_message: errorMessage,
        request_id: requestId,
      },
    },
  };
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

    const failure = resolvePlaidLinkTokenFailure(
      new PlaidSafeError("missing_server_configuration"),
    );
    expect(failure.code).toBe("missing_server_configuration");
    expect(linkTokenFailureHttpStatus(failure.code)).toBe(500);
    expect(isPlaidLinkTokenPrePlaidFailure(failure.code)).toBe(true);
    expect(isPlaidLinkTokenPlaidApiFailure(failure.code)).toBe(false);
  });

  it("maps invalid runtime environment to a safe diagnostic code", () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.PLAID_ENV;

    expect(() => getPlaidEnvironment()).toThrowError(
      expect.objectContaining({ code: "invalid_runtime_environment" }),
    );

    const failure = resolvePlaidLinkTokenFailure(
      new PlaidSafeError("invalid_runtime_environment"),
    );
    expect(failure.code).toBe("invalid_runtime_environment");
    expect(linkTokenFailureHttpStatus(failure.code)).toBe(500);
  });

  it("maps unexpected local failures to plaid_request_failed", () => {
    const failure = resolvePlaidLinkTokenFailure(new Error("unexpected"));
    expect(failure.code).toBe("plaid_request_failed");
    expect(failure.clientError).toBe("plaid_request_failed");
    expect(linkTokenFailureHttpStatus(failure.code)).toBe(400);
  });

  it("extracts INVALID_API_KEYS safely from Plaid API responses", () => {
    const failure = resolvePlaidLinkTokenFailure(
      buildPlaidAxiosError({
        errorType: "INVALID_INPUT",
        errorCode: "INVALID_API_KEYS",
      }),
    );

    expect(failure.code).toBe("plaid_api_error");
    expect(failure.plaidErrorCode).toBe("INVALID_API_KEYS");
    expect(failure.clientError).toBe("plaid_api_error: INVALID_API_KEYS");
  });

  it("extracts INVALID_CONFIGURATION safely from Plaid API responses", () => {
    const failure = resolvePlaidLinkTokenFailure(
      buildPlaidAxiosError({
        errorType: "INVALID_REQUEST",
        errorCode: "INVALID_CONFIGURATION",
      }),
    );

    expect(failure.code).toBe("plaid_api_error");
    expect(failure.plaidErrorType).toBe("INVALID_REQUEST");
    expect(failure.plaidErrorCode).toBe("INVALID_CONFIGURATION");
  });

  it("extracts INVALID_FIELD safely from PlaidSafeError metadata", () => {
    const failure = resolvePlaidLinkTokenFailure(
      new PlaidSafeError("update_failed", "update_failed", "INVALID_FIELD", {
        plaidErrorType: "INVALID_REQUEST",
        httpStatus: 400,
      }),
    );

    expect(failure.code).toBe("plaid_api_error");
    expect(failure.plaidErrorCode).toBe("INVALID_FIELD");
    expect(failure.plaidErrorType).toBe("INVALID_REQUEST");
    expect(failure.status).toBe(400);
  });

  it("keeps unknown valid-format Plaid codes visible safely", () => {
    const failure = resolvePlaidLinkTokenFailure(
      buildPlaidAxiosError({
        errorType: "ITEM_ERROR",
        errorCode: "NEW_FUTURE_CODE",
      }),
    );

    expect(failure.plaidErrorCode).toBe("NEW_FUTURE_CODE");
    expect(failure.clientError).toBe("plaid_api_error: NEW_FUTURE_CODE");
  });

  it("maps malformed error_code values to UNKNOWN_PLAID_ERROR", () => {
    expect(sanitizePlaidDiagnosticToken("bad-code")).toBe(UNKNOWN_PLAID_ERROR);
    expect(
      resolvePlaidLinkTokenFailure(
        buildPlaidAxiosError({
          errorType: "INVALID_REQUEST",
          errorCode: "bad-code",
        }),
      ).plaidErrorCode,
    ).toBe(UNKNOWN_PLAID_ERROR);
  });

  it("never returns raw error_message in client diagnostics", () => {
    const failure = resolvePlaidLinkTokenFailure(
      buildPlaidAxiosError({
        errorType: "INVALID_REQUEST",
        errorCode: "INVALID_CONFIGURATION",
        errorMessage: "client_id must be a properly formatted string",
      }),
    );

    expect(JSON.stringify(failure)).not.toContain("client_id");
    expect(failure.clientError).not.toMatch(/must be|formatted|string/i);
  });

  it("never returns request_id in client diagnostics", () => {
    const failure = resolvePlaidLinkTokenFailure(
      buildPlaidAxiosError({
        errorType: "INVALID_REQUEST",
        errorCode: "INVALID_CONFIGURATION",
        requestId: "req-secret-123",
      }),
    );

    expect(JSON.stringify(failure)).not.toContain("req-secret-123");
    expect(JSON.stringify(failure)).not.toContain("request_id");
  });

  it("never returns credentials or headers in client diagnostics", () => {
    const failure = resolvePlaidLinkTokenFailure(
      new PlaidSafeError("missing_server_configuration"),
    );

    expect(JSON.stringify(failure)).not.toMatch(/secret|PLAID-CLIENT-ID|cookie|header/i);
    expect(failure.clientError).toBe("missing_server_configuration");
  });

  it("distinguishes network failure from Plaid API rejection", () => {
    const networkFailure = resolvePlaidLinkTokenFailure({ code: "ECONNABORTED" });
    const apiFailure = resolvePlaidLinkTokenFailure(
      buildPlaidAxiosError({
        errorType: "INVALID_INPUT",
        errorCode: "INVALID_API_KEYS",
      }),
    );

    expect(networkFailure.code).toBe("plaid_network_failed");
    expect(apiFailure.code).toBe("plaid_api_error");
    expect(isPlaidLinkTokenPlaidApiFailure(networkFailure.code)).toBe(true);
    expect(isPlaidLinkTokenPlaidApiFailure(apiFailure.code)).toBe(true);
  });

  it("logs only safe Plaid API fields for API failures", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logPlaidLinkTokenDiagnostic({
      code: "plaid_api_error",
      clientError: "plaid_api_error: INVALID_CONFIGURATION",
      plaidErrorType: "INVALID_REQUEST",
      plaidErrorCode: "INVALID_CONFIGURATION",
      status: 400,
    });

    expect(errorSpy).toHaveBeenCalledWith("[plaid-link-token]", {
      error: "plaid_api_error",
      plaidErrorType: "INVALID_REQUEST",
      plaidErrorCode: "INVALID_CONFIGURATION",
      status: 400,
    });
  });

  it("logs only the generic diagnostic code for non-API failures", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logPlaidLinkTokenDiagnostic({
      code: "missing_server_configuration",
      clientError: "missing_server_configuration",
    });

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

  it("maps createLinkToken Plaid API rejections to plaid_api_error diagnostics", async () => {
    process.env.PLAID_ENV = "sandbox";
    process.env.PLAID_CLIENT_ID = "client-id";
    process.env.PLAID_SECRET = "secret";

    linkTokenCreateMock.mockRejectedValue(
      buildPlaidAxiosError({
        errorType: "INVALID_REQUEST",
        errorCode: "INVALID_FIELD",
      }),
    );

    await expect(createLinkToken("user-123")).rejects.toMatchObject({
      code: "update_failed",
      plaidErrorCode: "INVALID_FIELD",
    });

    const failure = resolvePlaidLinkTokenFailure(
      new PlaidSafeError("update_failed", "update_failed", "INVALID_FIELD", {
        plaidErrorType: "INVALID_REQUEST",
        httpStatus: 400,
      }),
    );

    expect(failure.code).toBe("plaid_api_error");
    expect(isPlaidLinkTokenPrePlaidFailure("missing_server_configuration")).toBe(true);
    expect(isPlaidLinkTokenPlaidApiFailure(failure.code)).toBe(true);
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

  it("formats browser diagnostics with the safe Plaid error code only", () => {
    expect(
      formatPlaidLinkTokenClientError({
        code: "plaid_api_error",
        clientError: "",
        plaidErrorCode: "INVALID_API_KEYS",
      }),
    ).toBe("plaid_api_error: INVALID_API_KEYS");
  });

  it("extracts safe fields via extractSafePlaidApiError without sensitive data", () => {
    const extracted = extractSafePlaidApiError(
      buildPlaidAxiosError({
        errorType: "INVALID_REQUEST",
        errorCode: "INVALID_CONFIGURATION",
        errorMessage: "sensitive details",
        requestId: "req-123",
      }),
    );

    expect(extracted).toEqual({
      status: 400,
      errorType: "INVALID_REQUEST",
      errorCode: "INVALID_CONFIGURATION",
    });
    expect(JSON.stringify(extracted)).not.toContain("sensitive");
    expect(JSON.stringify(extracted)).not.toContain("req-123");
  });
});

describe("plaid link-token auth expectations", () => {
  it("uses unauthenticated as the safe rejection code", () => {
    expect(linkTokenFailureHttpStatus("unauthenticated")).toBe(401);
    expect(resolvePlaidLinkTokenDiagnosticCode(new PlaidSafeError("unauthorized"))).toBe(
      "plaid_request_failed",
    );
  });
});

describe("plaid link-token create request shape", () => {
  let envSnapshot: EnvSnapshot;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
    resetPlaidClientCacheForTests();
    linkTokenCreateMock.mockReset();
    process.env.PLAID_ENV = "sandbox";
    process.env.PLAID_CLIENT_ID = "client-id";
    process.env.PLAID_SECRET = "secret";
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
    resetPlaidClientCacheForTests();
  });

  it("sends the expected non-secret link-token request fields", async () => {
    linkTokenCreateMock.mockResolvedValue({
      data: {
        link_token: "link-token",
        expiration: "2026-08-07T00:00:00Z",
      },
    });

    await createLinkToken("user-123");

    expect(linkTokenCreateMock).toHaveBeenCalledWith({
      user: { client_user_id: "user-123" },
      client_name: "Parker Jarvis",
      products: ["transactions"],
      country_codes: ["US"],
      language: "en",
      transactions: {
        days_requested: 730,
      },
    });

    const request = linkTokenCreateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request).not.toHaveProperty("redirect_uri");
    expect(request).not.toHaveProperty("webhook");
  });
});
