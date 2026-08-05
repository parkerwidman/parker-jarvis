import "server-only";

export type MetricoolConnectStage =
  | "authenticate"
  | "load_connection"
  | "resolve_redirect_uri"
  | "decrypt_client_information"
  | "validate_client_redirect"
  | "dynamic_client_registration"
  | "save_client_information"
  | "create_oauth_state"
  | "create_pkce"
  | "write_oauth_cookies"
  | "build_authorization_url"
  | "return_redirect";

export type MetricoolConnectSafeErrorCategory =
  | "connection_failed"
  | "oauth_client_registration_failed"
  | "authorization_url_failed"
  | "oauth_token_refresh_failed"
  | "oauth_verification_failed";

type MetricoolConnectDiagnosticDetails = {
  stage: MetricoolConnectStage;
  connectionStatus?: string | null;
  hasEncryptedClientInformation?: boolean;
  hasEncryptedAccessCredentials?: boolean;
  redirectOrigin?: string;
  callbackUrl?: string;
  storedClientRedirectUris?: string[];
  storedClientMatchesCallback?: boolean;
  clientStorageVersion?: number | "legacy" | "missing";
  authResult?: string;
  errorCategory?: MetricoolConnectSafeErrorCategory;
  errorClass?: string;
};

export function logMetricoolConnectDiagnostic(
  details: MetricoolConnectDiagnosticDetails,
): void {
  console.info("[metricool-connect]", JSON.stringify(details));
}

export function classifyConnectFailure(
  stage: MetricoolConnectStage,
  error: unknown,
): MetricoolConnectSafeErrorCategory {
  switch (stage) {
    case "dynamic_client_registration":
    case "save_client_information":
    case "decrypt_client_information":
    case "validate_client_redirect":
      return "oauth_client_registration_failed";
    case "create_pkce":
    case "write_oauth_cookies":
    case "build_authorization_url":
    case "return_redirect":
      return "authorization_url_failed";
    case "create_oauth_state":
      return "authorization_url_failed";
    default:
      if (error instanceof Error && error.name === "MetricoolSafeError") {
        return "connection_failed";
      }
      return "connection_failed";
  }
}
