import "server-only";

import type { MicrosoftOAuthMode } from "@/lib/microsoft/oauth-state";

export const MICROSOFT_CALLBACK_STAGES = {
  oauthStateValidation: "oauth_state_validation",
  authorizationCodeExchange: "authorization_code_exchange",
  tokenResponseValidation: "token_response_validation",
  permissionStateResolution: "permission_state_resolution",
  tokenPersistence: "token_persistence",
  callbackCompletion: "callback_completion",
} as const;

export type MicrosoftCallbackStage =
  (typeof MICROSOFT_CALLBACK_STAGES)[keyof typeof MICROSOFT_CALLBACK_STAGES];

export type MicrosoftCallbackDiagnostic = {
  stage: MicrosoftCallbackStage;
  mode: MicrosoftOAuthMode;
  success: boolean;
  resultCode?: string;
  httpStatusClass?: string;
  hasAccessToken?: boolean;
  hasRefreshToken?: boolean;
  hasScope?: boolean;
};

export function logMicrosoftOAuthCallbackDiagnostic(
  diagnostic: MicrosoftCallbackDiagnostic,
): void {
  console.log(
    JSON.stringify({
      event: "microsoft_oauth_callback",
      stage: diagnostic.stage,
      mode: diagnostic.mode,
      success: diagnostic.success,
      ...(diagnostic.resultCode ? { resultCode: diagnostic.resultCode } : {}),
      ...(diagnostic.httpStatusClass
        ? { httpStatusClass: diagnostic.httpStatusClass }
        : {}),
      ...(diagnostic.hasAccessToken !== undefined
        ? { hasAccessToken: diagnostic.hasAccessToken }
        : {}),
      ...(diagnostic.hasRefreshToken !== undefined
        ? { hasRefreshToken: diagnostic.hasRefreshToken }
        : {}),
      ...(diagnostic.hasScope !== undefined ? { hasScope: diagnostic.hasScope } : {}),
    }),
  );
}

export function httpStatusClass(status: number): string {
  if (status >= 500) {
    return "5xx";
  }

  if (status >= 400) {
    return "4xx";
  }

  if (status >= 300) {
    return "3xx";
  }

  return "2xx";
}
