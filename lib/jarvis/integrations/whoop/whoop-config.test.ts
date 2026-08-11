import { describe, expect, it } from "vitest";

import {
  formatWhoopGrantedScopesDisplay,
  isWhoopRemoteRevokeCleanupPending,
  toWhoopSafeLastErrorMessage,
  WHOOP_CONNECTION_INTERNAL_ERROR_CODES,
} from "@/lib/jarvis/integrations/whoop/whoop-connection-errors";
import { normalizeWhoopGrantedScopes } from "@/lib/jarvis/integrations/whoop/whoop-config";

describe("WHOOP granted scope normalization", () => {
  it("stores an empty array when WHOOP omits scope", () => {
    expect(normalizeWhoopGrantedScopes(undefined)).toEqual([]);
    expect(normalizeWhoopGrantedScopes("")).toEqual([]);
    expect(normalizeWhoopGrantedScopes("   ")).toEqual([]);
  });

  it("stores only scopes reported by WHOOP", () => {
    expect(normalizeWhoopGrantedScopes("offline read:recovery")).toEqual([
      "offline",
      "read:recovery",
    ]);
  });
});

describe("WHOOP granted scope display", () => {
  it("shows a truthful message when connected but scopes were not reported", () => {
    expect(formatWhoopGrantedScopesDisplay([], true)).toBe(
      "Provider did not report scopes",
    );
  });

  it("shows nothing when disconnected and scopes are empty", () => {
    expect(formatWhoopGrantedScopesDisplay([], false)).toBeNull();
  });
});

describe("WHOOP safe last error messages", () => {
  it("maps internal cleanup-pending sentinel to a safe user message", () => {
    expect(
      toWhoopSafeLastErrorMessage(
        WHOOP_CONNECTION_INTERNAL_ERROR_CODES.remoteRevokeLocalCleanupPending,
      ),
    ).toContain("finish disconnect cleanup");
    expect(
      toWhoopSafeLastErrorMessage(
        WHOOP_CONNECTION_INTERNAL_ERROR_CODES.remoteRevokeLocalCleanupPending,
      ),
    ).not.toContain("remote_revoke_local_cleanup_pending");
  });

  it("detects confirmed remote revoke cleanup pending state", () => {
    expect(
      isWhoopRemoteRevokeCleanupPending(
        WHOOP_CONNECTION_INTERNAL_ERROR_CODES.remoteRevokeLocalCleanupPending,
      ),
    ).toBe(true);
  });
});
