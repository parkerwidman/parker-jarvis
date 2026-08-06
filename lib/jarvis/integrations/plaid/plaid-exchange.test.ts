import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const itemPublicTokenExchangeMock = vi.fn();

vi.mock("plaid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("plaid")>();

  class MockPlaidApi {
    itemPublicTokenExchange = itemPublicTokenExchangeMock;
  }

  return {
    ...actual,
    PlaidApi: MockPlaidApi,
  };
});

import {
  exchangePublicToken,
  resetPlaidClientCacheForTests,
} from "@/lib/jarvis/integrations/plaid/plaid-client";
import {
  exchangeFailureHttpStatus,
  formatPlaidExchangeClientError,
  hasExchangeEncryptionKeyConfigured,
  isPlaidExchangePlaidApiFailure,
  isPlaidExchangePrePlaidFailure,
  logPlaidExchangeDiagnostic,
  resolvePlaidExchangeFailure,
} from "@/lib/jarvis/integrations/plaid/plaid-exchange-errors";
import {
  extractPublicTokenFromExchangeBody,
  isValidPlaidPublicTokenFormat,
  parseExchangePublicToken,
} from "@/lib/jarvis/integrations/plaid/plaid-exchange-payload";
import { PlaidSafeError } from "@/lib/jarvis/integrations/plaid/plaid-types";

const ENV_KEYS = [
  "PLAID_ENV",
  "PLAID_CLIENT_ID",
  "PLAID_SECRET",
  "PLAID_TOKEN_ENCRYPTION_KEY",
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

const VALID_PRODUCTION_PUBLIC_TOKEN =
  "public-production-11111111-2222-3333-4444-555555555555";
const VALID_SANDBOX_PUBLIC_TOKEN =
  "public-sandbox-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("plaid exchange payload", () => {
  it("accepts camelCase publicToken from the client", () => {
    expect(
      parseExchangePublicToken({ publicToken: VALID_PRODUCTION_PUBLIC_TOKEN }),
    ).toEqual({ publicToken: VALID_PRODUCTION_PUBLIC_TOKEN });
  });

  it("accepts snake_case public_token as a fallback", () => {
    expect(
      parseExchangePublicToken({ public_token: VALID_SANDBOX_PUBLIC_TOKEN }),
    ).toEqual({ publicToken: VALID_SANDBOX_PUBLIC_TOKEN });
  });

  it("prefers camelCase when both payload keys are present", () => {
    expect(
      parseExchangePublicToken({
        publicToken: VALID_PRODUCTION_PUBLIC_TOKEN,
        public_token: VALID_SANDBOX_PUBLIC_TOKEN,
      }),
    ).toEqual({ publicToken: VALID_PRODUCTION_PUBLIC_TOKEN });
  });

  it("rejects malformed JSON bodies safely", () => {
    expect(parseExchangePublicToken(null)).toBeNull();
    expect(parseExchangePublicToken("public-production-token")).toBeNull();
    expect(parseExchangePublicToken({ publicToken: 123 })).toBeNull();
  });

  it("rejects missing public token safely", () => {
    expect(parseExchangePublicToken({})).toBeNull();
    expect(parseExchangePublicToken({ linkToken: "link-token" })).toBeNull();
  });

  it("rejects invalid public token format safely", () => {
    expect(parseExchangePublicToken({ publicToken: "not-a-public-token" })).toBeNull();
    expect(
      parseExchangePublicToken({ publicToken: "public-development-abc" }),
    ).toBeNull();
  });

  it("rejects empty and oversized public tokens safely", () => {
    expect(parseExchangePublicToken({ publicToken: "   " })).toBeNull();
    expect(
      parseExchangePublicToken({
        publicToken: `public-production-${"a".repeat(600)}`,
      }),
    ).toBeNull();
  });

  it("validates production and sandbox public token formats", () => {
    expect(isValidPlaidPublicTokenFormat(VALID_PRODUCTION_PUBLIC_TOKEN)).toBe(true);
    expect(isValidPlaidPublicTokenFormat(VALID_SANDBOX_PUBLIC_TOKEN)).toBe(true);
    expect(isValidPlaidPublicTokenFormat("public-production")).toBe(false);
  });

  it("trims whitespace from extracted public tokens", () => {
    expect(
      extractPublicTokenFromExchangeBody({
        publicToken: `  ${VALID_PRODUCTION_PUBLIC_TOKEN}  `,
      }),
    ).toBe(VALID_PRODUCTION_PUBLIC_TOKEN);
  });
});

describe("plaid exchange diagnostics", () => {
  let envSnapshot: EnvSnapshot;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
    resetPlaidClientCacheForTests();
    itemPublicTokenExchangeMock.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
    resetPlaidClientCacheForTests();
  });

  it("maps unauthenticated requests to HTTP 401", () => {
    expect(exchangeFailureHttpStatus("unauthenticated")).toBe(401);
    expect(isPlaidExchangePrePlaidFailure("unauthenticated")).toBe(true);
  });

  it("maps invalid public token payload to HTTP 400", () => {
    expect(exchangeFailureHttpStatus("invalid_public_token_payload")).toBe(400);
    expect(isPlaidExchangePrePlaidFailure("invalid_public_token_payload")).toBe(true);
  });

  it("distinguishes missing encryption configuration", () => {
    delete process.env.PLAID_TOKEN_ENCRYPTION_KEY;

    const failure = resolvePlaidExchangeFailure(new PlaidSafeError("not_configured"), {
      encryptionKeyConfigured: hasExchangeEncryptionKeyConfigured(),
    });

    expect(failure.code).toBe("missing_server_configuration");
    expect(exchangeFailureHttpStatus(failure.code)).toBe(500);
  });

  it("distinguishes invalid encryption configuration", () => {
    process.env.PLAID_TOKEN_ENCRYPTION_KEY = "not-a-valid-key";

    const failure = resolvePlaidExchangeFailure(new PlaidSafeError("not_configured"), {
      encryptionKeyConfigured: hasExchangeEncryptionKeyConfigured(),
    });

    expect(failure.code).toBe("token_encryption_configuration_failed");
    expect(exchangeFailureHttpStatus(failure.code)).toBe(500);
  });

  it("distinguishes duplicate connections safely", () => {
    const failure = resolvePlaidExchangeFailure({ code: "23505" }, {
      encryptionKeyConfigured: true,
    });

    expect(failure.code).toBe("duplicate_connection");
    expect(exchangeFailureHttpStatus(failure.code)).toBe(409);
  });

  it("distinguishes database persistence failures", () => {
    const failure = resolvePlaidExchangeFailure({ code: "42501" }, {
      encryptionKeyConfigured: true,
    });

    expect(failure.code).toBe("connection_persistence_failed");
    expect(exchangeFailureHttpStatus(failure.code)).toBe(400);
  });

  it("distinguishes Plaid API rejection from pre-Plaid failure", () => {
    const prePlaidFailure = resolvePlaidExchangeFailure(
      new PlaidSafeError("missing_server_configuration"),
      { encryptionKeyConfigured: true },
    );
    const apiFailure = resolvePlaidExchangeFailure(
      buildPlaidAxiosError({
        errorType: "INVALID_INPUT",
        errorCode: "INVALID_PUBLIC_TOKEN",
        errorMessage: "provided public token is invalid",
        requestId: "req-secret",
      }),
      { encryptionKeyConfigured: true },
    );

    expect(prePlaidFailure.code).toBe("missing_server_configuration");
    expect(isPlaidExchangePrePlaidFailure(prePlaidFailure.code)).toBe(true);
    expect(apiFailure.code).toBe("plaid_api_error");
    expect(isPlaidExchangePlaidApiFailure(apiFailure.code)).toBe(true);
  });

  it("never exposes public tokens or sensitive metadata in diagnostics", () => {
    const failure = resolvePlaidExchangeFailure(
      buildPlaidAxiosError({
        errorType: "INVALID_INPUT",
        errorCode: "INVALID_PUBLIC_TOKEN",
        errorMessage: "token public-production-secret-value is invalid",
        requestId: "req-secret-123",
      }),
      { encryptionKeyConfigured: true },
    );

    expect(JSON.stringify(failure)).not.toContain("public-production-secret-value");
    expect(JSON.stringify(failure)).not.toContain("req-secret-123");
    expect(failure.clientError).toBe("plaid_api_error: INVALID_PUBLIC_TOKEN");
  });

  it("logs only safe Plaid API fields for API failures", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logPlaidExchangeDiagnostic({
      code: "plaid_api_error",
      clientError: "plaid_api_error: INVALID_PUBLIC_TOKEN",
      plaidErrorType: "INVALID_INPUT",
      plaidErrorCode: "INVALID_PUBLIC_TOKEN",
      status: 400,
    });

    expect(errorSpy).toHaveBeenCalledWith("[plaid-exchange]", {
      error: "plaid_api_error",
      plaidErrorType: "INVALID_INPUT",
      plaidErrorCode: "INVALID_PUBLIC_TOKEN",
      status: 400,
    });
  });

  it("logs only the generic diagnostic code for non-API failures", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logPlaidExchangeDiagnostic({
      code: "invalid_public_token_payload",
      clientError: "invalid_public_token_payload",
    });

    expect(errorSpy).toHaveBeenCalledWith("[plaid-exchange]", {
      error: "invalid_public_token_payload",
    });
  });

  it("formats browser diagnostics with the safe Plaid error code only", () => {
    expect(
      formatPlaidExchangeClientError({
        code: "plaid_api_error",
        clientError: "",
        plaidErrorCode: "INVALID_PUBLIC_TOKEN",
      }),
    ).toBe("plaid_api_error: INVALID_PUBLIC_TOKEN");
  });
});

describe("plaid exchange client reachability", () => {
  let envSnapshot: EnvSnapshot;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
    resetPlaidClientCacheForTests();
    itemPublicTokenExchangeMock.mockReset();
    process.env.PLAID_CLIENT_ID = "client-id";
    process.env.PLAID_SECRET = "secret";
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
    resetPlaidClientCacheForTests();
  });

  it("reaches itemPublicTokenExchange for valid production configuration", async () => {
    process.env.PLAID_ENV = "production";

    itemPublicTokenExchangeMock.mockResolvedValue({
      data: {
        access_token: "access-production-token",
        item_id: "item-production-id",
      },
    });

    const result = await exchangePublicToken(VALID_PRODUCTION_PUBLIC_TOKEN);

    expect(itemPublicTokenExchangeMock).toHaveBeenCalledOnce();
    expect(itemPublicTokenExchangeMock).toHaveBeenCalledWith({
      public_token: VALID_PRODUCTION_PUBLIC_TOKEN,
    });
    expect(result.itemId).toBe("item-production-id");
  });

  it("reaches itemPublicTokenExchange for valid sandbox configuration", async () => {
    process.env.PLAID_ENV = "sandbox";

    itemPublicTokenExchangeMock.mockResolvedValue({
      data: {
        access_token: "access-sandbox-token",
        item_id: "item-sandbox-id",
      },
    });

    const result = await exchangePublicToken(VALID_SANDBOX_PUBLIC_TOKEN);

    expect(itemPublicTokenExchangeMock).toHaveBeenCalledOnce();
    expect(itemPublicTokenExchangeMock).toHaveBeenCalledWith({
      public_token: VALID_SANDBOX_PUBLIC_TOKEN,
    });
    expect(result.itemId).toBe("item-sandbox-id");
  });

  it("does not reach Plaid when server configuration is missing", async () => {
    process.env.PLAID_ENV = "production";
    delete process.env.PLAID_CLIENT_ID;
    delete process.env.PLAID_SECRET;

    await expect(exchangePublicToken(VALID_PRODUCTION_PUBLIC_TOKEN)).rejects.toMatchObject({
      code: "missing_server_configuration",
    });
    expect(itemPublicTokenExchangeMock).not.toHaveBeenCalled();
  });

  it("maps invalid runtime environment before reaching Plaid", async () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.PLAID_ENV;

    await expect(exchangePublicToken(VALID_PRODUCTION_PUBLIC_TOKEN)).rejects.toMatchObject({
      code: "invalid_runtime_environment",
    });
    expect(itemPublicTokenExchangeMock).not.toHaveBeenCalled();
  });
});

describe("plaid exchange pre-plaid write safety", () => {
  it("identifies pre-Plaid payload failures that perform no persistence work", () => {
    expect(isPlaidExchangePrePlaidFailure("invalid_public_token_payload")).toBe(true);
    expect(isPlaidExchangePrePlaidFailure("invalid_request")).toBe(true);
    expect(isPlaidExchangePrePlaidFailure("plaid_api_error")).toBe(false);
    expect(isPlaidExchangePrePlaidFailure("connection_persistence_failed")).toBe(false);
  });
});

describe("plaid exchange environment isolation", () => {
  let envSnapshot: EnvSnapshot;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
    resetPlaidClientCacheForTests();
    itemPublicTokenExchangeMock.mockReset();
    process.env.PLAID_CLIENT_ID = "client-id";
    process.env.PLAID_SECRET = "secret";
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
    resetPlaidClientCacheForTests();
  });

  it("uses production Plaid base path for production exchange", async () => {
    process.env.PLAID_ENV = "production";

    itemPublicTokenExchangeMock.mockResolvedValue({
      data: {
        access_token: "access-production-token",
        item_id: "item-production-id",
      },
    });

    await exchangePublicToken(VALID_PRODUCTION_PUBLIC_TOKEN);

    expect(itemPublicTokenExchangeMock).toHaveBeenCalledOnce();
  });

  it("uses sandbox Plaid base path for sandbox exchange", async () => {
    process.env.PLAID_ENV = "sandbox";

    itemPublicTokenExchangeMock.mockResolvedValue({
      data: {
        access_token: "access-sandbox-token",
        item_id: "item-sandbox-id",
      },
    });

    await exchangePublicToken(VALID_SANDBOX_PUBLIC_TOKEN);

    expect(itemPublicTokenExchangeMock).toHaveBeenCalledOnce();
  });
});
