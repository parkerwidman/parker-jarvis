import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  disconnectWhoopConnection,
  loadWhoopConnectionMetadataByUserId,
  markWhoopRemoteRevokeCleanupPending,
} from "@/lib/jarvis/integrations/whoop/whoop-connection-tools";
import { WHOOP_CONNECTION_INTERNAL_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-connection-errors";
import {
  executeWhoopDisconnect,
  finishWhoopLocalDisconnectWithRetries,
} from "@/lib/jarvis/integrations/whoop/whoop-disconnect-service";
import { revokeWhoopAccess } from "@/lib/jarvis/integrations/whoop/whoop-oauth-client";
import { WHOOP_OAUTH_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-oauth-errors";
import { getValidWhoopAccessToken } from "@/lib/jarvis/integrations/whoop/whoop-token-manager";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const loadWhoopConnectionMetadataByUserIdMock = vi.fn();
const markWhoopRemoteRevokeCleanupPendingMock = vi.fn();
const disconnectWhoopConnectionMock = vi.fn();
const getValidWhoopAccessTokenMock = vi.fn();
const revokeWhoopAccessMock = vi.fn();

vi.mock("@/lib/jarvis/integrations/whoop/whoop-connection-tools", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/jarvis/integrations/whoop/whoop-connection-tools")
  >("@/lib/jarvis/integrations/whoop/whoop-connection-tools");

  return {
    ...actual,
    loadWhoopConnectionMetadataByUserId: (...args: unknown[]) =>
      loadWhoopConnectionMetadataByUserIdMock(...args),
    markWhoopRemoteRevokeCleanupPending: (...args: unknown[]) =>
      markWhoopRemoteRevokeCleanupPendingMock(...args),
    disconnectWhoopConnection: (...args: unknown[]) =>
      disconnectWhoopConnectionMock(...args),
  };
});

vi.mock("@/lib/jarvis/integrations/whoop/whoop-token-manager", () => ({
  getValidWhoopAccessToken: (...args: unknown[]) =>
    getValidWhoopAccessTokenMock(...args),
}));

vi.mock("@/lib/jarvis/integrations/whoop/whoop-oauth-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/jarvis/integrations/whoop/whoop-oauth-client")
  >("@/lib/jarvis/integrations/whoop/whoop-oauth-client");

  return {
    ...actual,
    revokeWhoopAccess: (...args: unknown[]) => revokeWhoopAccessMock(...args),
  };
});

describe("WHOOP disconnect reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markWhoopRemoteRevokeCleanupPendingMock.mockResolvedValue(undefined);
  });

  it("retries local cleanup after confirmed revoke and succeeds on a later attempt", async () => {
    loadWhoopConnectionMetadataByUserIdMock.mockResolvedValue({
      id: "connection-id",
      status: "connected",
      last_error_code: null,
      access_token_expires_at: "2099-01-01T00:00:00.000Z",
    });
    getValidWhoopAccessTokenMock.mockResolvedValue({
      success: true,
      accessToken: "access-token",
    });
    revokeWhoopAccessMock.mockResolvedValue({
      success: true,
      alreadyRevoked: false,
    });
    disconnectWhoopConnectionMock
      .mockRejectedValueOnce(new Error("local_failed"))
      .mockResolvedValueOnce(undefined);

    const result = await executeWhoopDisconnect(USER_ID);

    expect(result).toEqual({ ok: true, status: "disconnected" });
    expect(markWhoopRemoteRevokeCleanupPendingMock).toHaveBeenCalledWith(USER_ID);
    expect(revokeWhoopAccessMock).toHaveBeenCalledWith("access-token");
    expect(disconnectWhoopConnectionMock).toHaveBeenCalledTimes(2);
  });

  it("returns cleanup-pending when confirmed revoke succeeded but local cleanup never completes", async () => {
    loadWhoopConnectionMetadataByUserIdMock.mockResolvedValue({
      id: "connection-id",
      status: "connected",
      last_error_code: null,
      access_token_expires_at: "2099-01-01T00:00:00.000Z",
    });
    getValidWhoopAccessTokenMock.mockResolvedValue({
      success: true,
      accessToken: "access-token",
    });
    revokeWhoopAccessMock.mockResolvedValue({
      success: true,
      alreadyRevoked: true,
    });
    disconnectWhoopConnectionMock.mockRejectedValue(new Error("local_failed"));

    const result = await executeWhoopDisconnect(USER_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(WHOOP_OAUTH_ERROR_CODES.disconnectCleanupPending);
      expect(result.status).toBe("cleanup_pending");
      expect(result.httpStatus).toBe(503);
    }
    expect(markWhoopRemoteRevokeCleanupPendingMock).toHaveBeenCalledWith(USER_ID);
  });

  it("completes locally on retry without WHOOP token refresh when cleanup is pending", async () => {
    loadWhoopConnectionMetadataByUserIdMock.mockResolvedValue({
      id: "connection-id",
      status: "connected",
      last_error_code:
        WHOOP_CONNECTION_INTERNAL_ERROR_CODES.remoteRevokeLocalCleanupPending,
      access_token_expires_at: null,
    });
    disconnectWhoopConnectionMock.mockResolvedValue(undefined);

    const result = await executeWhoopDisconnect(USER_ID);

    expect(result).toEqual({ ok: true, status: "disconnected" });
    expect(getValidWhoopAccessTokenMock).not.toHaveBeenCalled();
    expect(revokeWhoopAccessMock).not.toHaveBeenCalled();
    expect(disconnectWhoopConnectionMock).toHaveBeenCalledWith(USER_ID);
  });

  it("preserves credentials and does not mark cleanup pending on WHOOP 5xx revoke failure", async () => {
    loadWhoopConnectionMetadataByUserIdMock.mockResolvedValue({
      id: "connection-id",
      status: "connected",
      last_error_code: null,
      access_token_expires_at: "2099-01-01T00:00:00.000Z",
    });
    getValidWhoopAccessTokenMock.mockResolvedValue({
      success: true,
      accessToken: "access-token",
    });
    revokeWhoopAccessMock.mockResolvedValue({
      success: false,
      retryable: true,
    });

    const result = await executeWhoopDisconnect(USER_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(WHOOP_OAUTH_ERROR_CODES.disconnectRemoteFailed);
      expect(result.httpStatus).toBe(502);
    }
    expect(markWhoopRemoteRevokeCleanupPendingMock).not.toHaveBeenCalled();
    expect(disconnectWhoopConnectionMock).not.toHaveBeenCalled();
  });

  it("does not mark confirmed revoke on network revoke failure", async () => {
    loadWhoopConnectionMetadataByUserIdMock.mockResolvedValue({
      id: "connection-id",
      status: "connected",
      last_error_code: null,
      access_token_expires_at: "2099-01-01T00:00:00.000Z",
    });
    getValidWhoopAccessTokenMock.mockResolvedValue({
      success: true,
      accessToken: "access-token",
    });
    revokeWhoopAccessMock.mockResolvedValue({
      success: false,
      retryable: true,
    });

    await executeWhoopDisconnect(USER_ID);

    expect(markWhoopRemoteRevokeCleanupPendingMock).not.toHaveBeenCalled();
  });
});

describe("finishWhoopLocalDisconnectWithRetries", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries local disconnect up to three times", async () => {
    disconnectWhoopConnectionMock
      .mockRejectedValueOnce(new Error("once"))
      .mockRejectedValueOnce(new Error("twice"))
      .mockResolvedValueOnce(undefined);

    await expect(finishWhoopLocalDisconnectWithRetries(USER_ID)).resolves.toBe(
      true,
    );
    expect(disconnectWhoopConnectionMock).toHaveBeenCalledTimes(3);
  });
});
