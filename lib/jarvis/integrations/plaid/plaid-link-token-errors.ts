import "server-only";

import type {
  PlaidLinkTokenDiagnosticCode,
  PlaidSafeError,
  PlaidSafeErrorCode,
} from "./plaid-types";
import { PlaidSafeError as PlaidSafeErrorClass } from "./plaid-types";

const SERVER_CONFIGURATION_CODES = new Set<PlaidLinkTokenDiagnosticCode>([
  "missing_server_configuration",
  "invalid_runtime_environment",
  "plaid_client_initialization_failed",
]);

const PLAID_API_FAILURE_CODES = new Set<PlaidSafeErrorCode>([
  "plaid_error",
  "plaid_request_failed",
  "reconnect_required",
  "product_not_ready",
  "rate_limited",
  "update_failed",
  "token_not_repairable",
]);

const PLAID_DIAGNOSTIC_TOKEN_PATTERN = /^[A-Z0-9_]{1,64}$/;
export const UNKNOWN_PLAID_ERROR = "UNKNOWN_PLAID_ERROR";

type PlaidApiErrorBody = {
  error_type?: unknown;
  error_code?: unknown;
  error_message?: unknown;
  request_id?: unknown;
};

export type PlaidLinkTokenFailure = {
  code: PlaidLinkTokenDiagnosticCode;
  clientError: string;
  plaidErrorType?: string;
  plaidErrorCode?: string;
  status?: number;
};

export function sanitizePlaidDiagnosticToken(value: unknown): string {
  if (typeof value !== "string") {
    return UNKNOWN_PLAID_ERROR;
  }

  const trimmed = value.trim();

  if (!PLAID_DIAGNOSTIC_TOKEN_PATTERN.test(trimmed)) {
    return UNKNOWN_PLAID_ERROR;
  }

  return trimmed;
}

export function extractSafePlaidApiError(error: unknown): {
  status: number | null;
  errorType: string;
  errorCode: string;
} | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const response = (error as { response?: { status?: unknown; data?: PlaidApiErrorBody } })
    .response;

  if (!response) {
    return null;
  }

  const status =
    typeof response.status === "number" && Number.isFinite(response.status)
      ? response.status
      : null;

  const data = response.data;

  return {
    status,
    errorType: sanitizePlaidDiagnosticToken(data?.error_type),
    errorCode: sanitizePlaidDiagnosticToken(data?.error_code),
  };
}

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

function hasPlaidApiResponse(error: unknown): boolean {
  return extractSafePlaidApiError(error) !== null;
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

export function formatPlaidLinkTokenClientError(failure: PlaidLinkTokenFailure): string {
  if (failure.code === "plaid_api_error" && failure.plaidErrorCode) {
    return `plaid_api_error: ${failure.plaidErrorCode}`;
  }

  return failure.code;
}

export function resolvePlaidLinkTokenFailure(error: unknown): PlaidLinkTokenFailure {
  if (error instanceof PlaidSafeErrorClass) {
    const mappedCode = mapPlaidSafeErrorToLinkTokenDiagnostic(error);

    if (mappedCode === "plaid_api_error") {
      const apiFailure = resolvePlaidApiFailureFromError(error);
      const plaidErrorCode = apiFailure?.plaidErrorCode ?? UNKNOWN_PLAID_ERROR;
      const plaidErrorType = apiFailure?.plaidErrorType ?? UNKNOWN_PLAID_ERROR;

      return {
        code: "plaid_api_error",
        clientError: formatPlaidLinkTokenClientError({
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

  if (hasPlaidApiResponse(error)) {
    const apiFailure = resolvePlaidApiFailureFromError(error)!;

    return {
      code: "plaid_api_error",
      clientError: formatPlaidLinkTokenClientError({
        code: "plaid_api_error",
        clientError: "",
        plaidErrorCode: apiFailure.plaidErrorCode,
      }),
      plaidErrorType: apiFailure.plaidErrorType,
      plaidErrorCode: apiFailure.plaidErrorCode,
      status: apiFailure.status,
    };
  }

  return {
    code: "plaid_request_failed",
    clientError: "plaid_request_failed",
  };
}

export function logPlaidLinkTokenDiagnostic(failure: PlaidLinkTokenFailure): void {
  if (failure.code === "plaid_api_error") {
    console.error("[plaid-link-token]", {
      error: failure.code,
      plaidErrorType: failure.plaidErrorType ?? UNKNOWN_PLAID_ERROR,
      plaidErrorCode: failure.plaidErrorCode ?? UNKNOWN_PLAID_ERROR,
      status: failure.status ?? null,
    });
    return;
  }

  console.error("[plaid-link-token]", { error: failure.code });
}

export function resolvePlaidLinkTokenDiagnosticCode(
  error: unknown,
): PlaidLinkTokenDiagnosticCode {
  return resolvePlaidLinkTokenFailure(error).code;
}

export function mapPlaidSafeErrorToLinkTokenDiagnostic(
  error: PlaidSafeError,
): PlaidLinkTokenDiagnosticCode {
  if (error.isNetworkFailure) {
    return "plaid_network_failed";
  }

  if (isPlaidApiSafeError(error)) {
    return "plaid_api_error";
  }

  switch (error.code) {
    case "not_configured":
    case "missing_server_configuration":
      return "missing_server_configuration";
    case "invalid_runtime_environment":
      return "invalid_runtime_environment";
    case "plaid_client_initialization_failed":
      return "plaid_client_initialization_failed";
    case "invalid_origin":
      return "invalid_origin";
    case "invalid_request":
      return "invalid_request";
    case "plaid_request_failed":
      return "plaid_request_failed";
    default:
      return "plaid_request_failed";
  }
}

export function linkTokenFailureHttpStatus(code: PlaidLinkTokenDiagnosticCode): number {
  if (code === "unauthenticated") {
    return 401;
  }

  if (SERVER_CONFIGURATION_CODES.has(code)) {
    return 500;
  }

  if (code === "invalid_origin") {
    return 403;
  }

  return 400;
}

export function isPlaidLinkTokenPlaidApiFailure(code: PlaidLinkTokenDiagnosticCode): boolean {
  return code === "plaid_api_error" || code === "plaid_network_failed";
}

export function isPlaidLinkTokenPrePlaidFailure(code: PlaidLinkTokenDiagnosticCode): boolean {
  return (
    code !== "plaid_api_error" &&
    code !== "plaid_network_failed" &&
    code !== "plaid_request_failed" &&
    code !== "connection_failed" &&
    code !== "unauthenticated" &&
    code !== "invalid_request" &&
    code !== "invalid_origin"
  );
}

export function isPlaidApiFailureCode(code: PlaidSafeErrorCode): boolean {
  return PLAID_API_FAILURE_CODES.has(code);
}
