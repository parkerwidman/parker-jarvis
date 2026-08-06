import "server-only";

import type {
  PlaidExchangeDiagnosticCode,
  PlaidSafeError,
  PlaidSafeErrorCode,
} from "./plaid-types";
import { PlaidSafeError as PlaidSafeErrorClass } from "./plaid-types";
import {
  extractSafePlaidApiError,
  sanitizePlaidDiagnosticToken,
  UNKNOWN_PLAID_ERROR,
} from "./plaid-link-token-errors";

const SERVER_CONFIGURATION_CODES = new Set<PlaidExchangeDiagnosticCode>([
  "missing_server_configuration",
  "invalid_runtime_environment",
  "plaid_client_initialization_failed",
  "token_encryption_configuration_failed",
]);

const PLAID_API_SAFE_ERROR_CODES = new Set<PlaidSafeErrorCode>([
  "plaid_error",
  "plaid_request_failed",
  "reconnect_required",
  "product_not_ready",
  "rate_limited",
  "update_failed",
  "token_not_repairable",
]);

export type PlaidExchangeFailure = {
  code: PlaidExchangeDiagnosticCode;
  clientError: string;
  plaidErrorType?: string;
  plaidErrorCode?: string;
  status?: number;
};

export type PlaidExchangeFailureContext = {
  encryptionKeyConfigured: boolean;
};

function isPlaidNetworkError(error: unknown): boolean {
  if (error instanceof PlaidSafeErrorClass && error.isNetworkFailure) {
    return true;
  }

  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as { response?: unknown; code?: string };

  if (candidate.response !== undefined) {
    return false;
  }

  return (
    candidate.code === "ECONNABORTED" ||
    candidate.code === "ENOTFOUND" ||
    candidate.code === "ECONNREFUSED" ||
    candidate.code === "ETIMEDOUT" ||
    candidate.code === "ERR_NETWORK"
  );
}

function isPlaidApiSafeError(error: PlaidSafeError): boolean {
  return (
    error.code === "plaid_error" ||
    error.code === "update_failed" ||
    error.code === "reconnect_required" ||
    error.code === "product_not_ready" ||
    error.code === "rate_limited" ||
    error.code === "token_not_repairable" ||
    Boolean(error.plaidErrorCode) ||
    typeof error.httpStatus === "number"
  );
}

function resolvePlaidApiFailureFromError(error: unknown): {
  status?: number;
  plaidErrorType: string;
  plaidErrorCode: string;
} | null {
  const fromResponse = extractSafePlaidApiError(error);

  if (fromResponse) {
    return {
      status: fromResponse.status ?? undefined,
      plaidErrorType: fromResponse.errorType,
      plaidErrorCode: fromResponse.errorCode,
    };
  }

  if (error instanceof PlaidSafeErrorClass) {
    const plaidErrorCode = error.plaidErrorCode
      ? sanitizePlaidDiagnosticToken(error.plaidErrorCode)
      : null;
    const plaidErrorType = error.plaidErrorType
      ? sanitizePlaidDiagnosticToken(error.plaidErrorType)
      : UNKNOWN_PLAID_ERROR;

    if (plaidErrorCode) {
      return {
        status:
          typeof error.httpStatus === "number" && Number.isFinite(error.httpStatus)
            ? error.httpStatus
            : undefined,
        plaidErrorType,
        plaidErrorCode,
      };
    }
  }

  return null;
}

function resolveTokenEncryptionDiagnostic(
  context: PlaidExchangeFailureContext,
): PlaidExchangeDiagnosticCode {
  return context.encryptionKeyConfigured
    ? "token_encryption_configuration_failed"
    : "missing_server_configuration";
}

export function mapPlaidSafeErrorToExchangeDiagnostic(
  error: PlaidSafeError,
  context: PlaidExchangeFailureContext,
): PlaidExchangeDiagnosticCode {
  if (error.isNetworkFailure) {
    return "plaid_network_failed";
  }

  if (isPlaidApiSafeError(error)) {
    return "plaid_api_error";
  }

  switch (error.code) {
    case "not_configured":
      return resolveTokenEncryptionDiagnostic(context);
    case "missing_server_configuration":
      return "missing_server_configuration";
    case "invalid_runtime_environment":
      return "invalid_runtime_environment";
    case "plaid_client_initialization_failed":
      return "plaid_client_initialization_failed";
    case "invalid_request":
      return "invalid_request";
    case "exchange_failed":
      return "exchange_failed";
    default:
      return "exchange_failed";
  }
}

export function formatPlaidExchangeClientError(failure: PlaidExchangeFailure): string {
  if (failure.code === "plaid_api_error" && failure.plaidErrorCode) {
    return `plaid_api_error: ${failure.plaidErrorCode}`;
  }

  return failure.code;
}

export function resolvePlaidExchangeFailure(
  error: unknown,
  context: PlaidExchangeFailureContext,
): PlaidExchangeFailure {
  if (error instanceof PlaidSafeErrorClass) {
    const mappedCode = mapPlaidSafeErrorToExchangeDiagnostic(error, context);

    if (mappedCode === "plaid_api_error") {
      const apiFailure = resolvePlaidApiFailureFromError(error);
      const plaidErrorCode = apiFailure?.plaidErrorCode ?? UNKNOWN_PLAID_ERROR;
      const plaidErrorType = apiFailure?.plaidErrorType ?? UNKNOWN_PLAID_ERROR;

      return {
        code: "plaid_api_error",
        clientError: formatPlaidExchangeClientError({
          code: "plaid_api_error",
          clientError: "",
          plaidErrorCode,
        }),
        plaidErrorType,
        plaidErrorCode,
        status: apiFailure?.status,
      };
    }

    if (mappedCode === "plaid_network_failed") {
      return {
        code: "plaid_network_failed",
        clientError: "plaid_network_failed",
      };
    }

    return {
      code: mappedCode,
      clientError: mappedCode,
    };
  }

  if (isPlaidNetworkError(error)) {
    return {
      code: "plaid_network_failed",
      clientError: "plaid_network_failed",
    };
  }

  const apiFailure = resolvePlaidApiFailureFromError(error);
  if (apiFailure) {
    return {
      code: "plaid_api_error",
      clientError: formatPlaidExchangeClientError({
        code: "plaid_api_error",
        clientError: "",
        plaidErrorCode: apiFailure.plaidErrorCode,
      }),
      plaidErrorType: apiFailure.plaidErrorType,
      plaidErrorCode: apiFailure.plaidErrorCode,
      status: apiFailure.status,
    };
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;

    if (code === "23505") {
      return {
        code: "duplicate_connection",
        clientError: "duplicate_connection",
      };
    }

    if (typeof code === "string") {
      return {
        code: "connection_persistence_failed",
        clientError: "connection_persistence_failed",
      };
    }
  }

  return {
    code: "exchange_failed",
    clientError: "exchange_failed",
  };
}

export function logPlaidExchangeDiagnostic(failure: PlaidExchangeFailure): void {
  if (failure.code === "plaid_api_error") {
    console.error("[plaid-exchange]", {
      error: failure.code,
      plaidErrorType: failure.plaidErrorType ?? UNKNOWN_PLAID_ERROR,
      plaidErrorCode: failure.plaidErrorCode ?? UNKNOWN_PLAID_ERROR,
      status: failure.status ?? null,
    });
    return;
  }

  console.error("[plaid-exchange]", { error: failure.code });
}

export function exchangeFailureHttpStatus(code: PlaidExchangeDiagnosticCode): number {
  if (code === "unauthenticated") {
    return 401;
  }

  if (code === "duplicate_connection") {
    return 409;
  }

  if (SERVER_CONFIGURATION_CODES.has(code)) {
    return 500;
  }

  return 400;
}

export function isPlaidExchangePrePlaidFailure(code: PlaidExchangeDiagnosticCode): boolean {
  return (
    code === "invalid_request" ||
    code === "invalid_public_token_payload" ||
    code === "unauthenticated" ||
    code === "missing_server_configuration" ||
    code === "invalid_runtime_environment" ||
    code === "plaid_client_initialization_failed"
  );
}

export function isPlaidExchangePlaidApiFailure(code: PlaidExchangeDiagnosticCode): boolean {
  return code === "plaid_api_error" || code === "plaid_network_failed";
}

export function isPlaidExchangePersistenceFailure(code: PlaidExchangeDiagnosticCode): boolean {
  return code === "connection_persistence_failed" || code === "duplicate_connection";
}

export function hasExchangeEncryptionKeyConfigured(): boolean {
  return Boolean(process.env.PLAID_TOKEN_ENCRYPTION_KEY);
}
