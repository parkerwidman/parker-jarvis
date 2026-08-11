import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  sanitizeWhoopOAuthProviderErrorCode,
  WHOOP_OAUTH_PROVIDER_ERROR_ALLOWLIST,
  WHOOP_UNKNOWN_OAUTH_ERROR,
} from "@/lib/jarvis/integrations/whoop/whoop-oauth-diagnostics";

describe("WHOOP OAuth provider error sanitization", () => {
  it("allowlists known WHOOP OAuth error codes", () => {
    for (const code of WHOOP_OAUTH_PROVIDER_ERROR_ALLOWLIST) {
      expect(sanitizeWhoopOAuthProviderErrorCode(code)).toBe(code);
    }
  });

  it("maps unknown provider errors to unknown_oauth_error", () => {
    expect(sanitizeWhoopOAuthProviderErrorCode("access_denied")).toBe(
      WHOOP_UNKNOWN_OAUTH_ERROR,
    );
  });

  it("maps malicious or long error values to unknown_oauth_error", () => {
    expect(
      sanitizeWhoopOAuthProviderErrorCode(
        "invalid_grant client_secret=super-secret-token",
      ),
    ).toBe(WHOOP_UNKNOWN_OAUTH_ERROR);
    expect(sanitizeWhoopOAuthProviderErrorCode("x".repeat(120))).toBe(
      WHOOP_UNKNOWN_OAUTH_ERROR,
    );
  });
});
