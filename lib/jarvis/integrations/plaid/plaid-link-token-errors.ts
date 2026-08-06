import "server-only";

import type {
  PlaidLinkTokenDiagnosticCode,
  PlaidSafeError,
  PlaidSafeErrorCode,
} from "./plaid-types";
import { PlaidSafeError as PlaidSafeErrorClass } from "./plaid-types";

const SERVER_CONFIGURATION_CODES = new Set<PlaidSafeErrorCode>([
  "not_configured",
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

export function logPlaidLinkTokenDiagnostic(code: PlaidLinkTokenDiagnosticCode): void {
  console.error("[plaid-link-token]", { error: code });
}

export function resolvePlaidLinkTokenDiagnosticCode(
  error: unknown,
): PlaidLinkTokenDiagnosticCode {
  if (error instanceof PlaidSafeErrorClass) {
    return mapPlaidSafeErrorToLinkTokenDiagnostic(error);
  }

  return "connection_failed";
}

export function mapPlaidSafeErrorToLinkTokenDiagnostic(
  error: PlaidSafeError,
): PlaidLinkTokenDiagnosticCode {
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
    case "plaid_error":
      return "plaid_request_failed";
    case "plaid_request_failed":
    case "reconnect_required":
    case "product_not_ready":
    case "rate_limited":
    case "update_failed":
    case "token_not_repairable":
      return "plaid_request_failed";
    default:
      return "connection_failed";
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
  return code === "plaid_request_failed";
}

export function isPlaidLinkTokenPrePlaidFailure(code: PlaidLinkTokenDiagnosticCode): boolean {
  return (
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
